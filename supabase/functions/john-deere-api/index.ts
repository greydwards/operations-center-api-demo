import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { optionsResponse, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { getAuthenticatedUser, isResponse } from "../_shared/auth.ts";
import {
  callJohnDeereApi,
  getValidToken,
  getUserConnection,
} from "../_shared/john-deere.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return optionsResponse();
  }

  try {
    const authResult = await getAuthenticatedUser(req);
    if (isResponse(authResult)) return authResult;
    const { user, supabase } = authResult;

    const connection = await getUserConnection(supabase, user.id);
    if (!connection) {
      return errorResponse("No John Deere connection found", 404);
    }

    const accessToken = await getValidToken(supabase, connection);
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "organizations") {
      const response = await callJohnDeereApi(accessToken, "/organizations");

      if (!response.ok) {
        const errorText = await response.text();
        return errorResponse(`John Deere API error: ${response.status}`, response.status, errorText);
      }

      return jsonResponse(await response.json());
    }

    if (action === "select-organization") {
      const { orgId, orgName } = await req.json();

      if (!orgId) {
        return errorResponse("Missing orgId", 400);
      }

      await supabase
        .from("john_deere_connections")
        .update({
          selected_org_id: orgId,
          selected_org_name: orgName || null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      return jsonResponse({ success: true });
    }

    if (action === "fields") {
      const orgId = connection.selected_org_id;
      if (!orgId) {
        return errorResponse("No organization selected", 400);
      }

      const response = await callJohnDeereApi(accessToken, `/organizations/${orgId}/fields`);
      if (!response.ok) {
        const errorText = await response.text();
        return errorResponse(`John Deere API error: ${response.status}`, response.status, errorText);
      }

      return jsonResponse(await response.json());
    }

    if (action === "get-stored-fields") {
      const orgId = connection.selected_org_id;
      if (!orgId) {
        return errorResponse("No organization selected", 400);
      }

      const { data: storedFields, error: fieldsError } = await supabase
        .from("fields")
        .select("*")
        .eq("user_id", user.id)
        .eq("org_id", orgId);

      if (fieldsError) {
        return errorResponse(fieldsError.message, 500);
      }

      return jsonResponse({ fields: storedFields || [] });
    }

    if (action === "get-stored-operations") {
      const orgId = connection.selected_org_id;
      if (!orgId) {
        return errorResponse("No organization selected", 400);
      }

      const fieldId = url.searchParams.get("fieldId");
      const operationType = url.searchParams.get("operationType");

      let query = supabase
        .from("field_operations")
        .select("*")
        .eq("user_id", user.id)
        .eq("org_id", orgId)
        .order("start_date", { ascending: false });

      if (fieldId) {
        query = query.eq("jd_field_id", fieldId);
      }
      if (operationType) {
        query = query.eq("operation_type", operationType);
      }

      const { data: operations, error: opsError } = await query;

      if (opsError) {
        return errorResponse(opsError.message, 500);
      }

      return jsonResponse({ operations: operations || [] });
    }

    return errorResponse("Unknown action", 400);
  } catch (error) {
    console.error("Error:", error);
    return errorResponse(error.message, 500);
  }
});
