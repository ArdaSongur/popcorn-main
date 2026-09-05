import { createClient } from "npm:@supabase/supabase-js@2.115.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
};

const json = (body: Record<string, unknown>, status = 200) => new Response(
    JSON.stringify(body),
    { status, headers: corsHeaders }
);

const readDefaultKey = (modernName: string, legacyName: string) => {
    const modernValue = Deno.env.get(modernName);

    if (modernValue) {
        try {
            const keys = JSON.parse(modernValue);
            if (typeof keys.default === "string") return keys.default;
        } catch {
            // Eski ve yeni Supabase key formatları aşağıda güvenli biçimde desteklenir.
        }
    }

    return Deno.env.get(legacyName);
};

Deno.serve(async (request) => {
    if (request.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (request.method !== "POST") {
        return json({ error: "method_not_allowed" }, 405);
    }

    let payload: { username?: unknown; password?: unknown };

    try {
        payload = await request.json();
    } catch {
        return json({ error: "invalid_request" }, 400);
    }

    const username = typeof payload.username === "string"
        ? payload.username.trim().toLowerCase()
        : "";
    const password = typeof payload.password === "string" ? payload.password : "";

    if (!/^[a-z0-9_]{3,24}$/.test(username) || password.length === 0) {
        return json({ error: "invalid_credentials" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const publishableKey = readDefaultKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    const secretKey = readDefaultKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !publishableKey || !secretKey) {
        return json({ error: "server_configuration_error" }, 500);
    }

    const adminClient = createClient(supabaseUrl, secretKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
    const authClient = createClient(supabaseUrl, publishableKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: profile, error: profileError } = await adminClient
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();

    if (profileError || !profile) {
        return json({ error: "invalid_credentials" }, 401);
    }

    const { data: userData, error: userError } = await adminClient.auth.admin
        .getUserById(profile.id);
    const email = userData.user?.email;

    if (userError || !email) {
        return json({ error: "invalid_credentials" }, 401);
    }

    const { data: signInData, error: signInError } = await authClient.auth
        .signInWithPassword({ email, password });

    if (signInError || !signInData.session) {
        return json({ error: "invalid_credentials" }, 401);
    }

    return json({
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token
    });
});
