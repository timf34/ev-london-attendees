import type { APIRoute } from "astro";
import { saveProfile } from "@/lib/profile-mutations";

export const prerender = false;

function redirect(location: string) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: location,
    },
  });
}

export const POST: APIRoute = async ({ params, request }) => {
  const secret = params.secret;
  if (!secret) {
    return redirect("/?error=Missing%20edit%20secret");
  }

  try {
    const formData = await request.formData();
    await saveProfile(secret, formData);
    return redirect(`/edit/${encodeURIComponent(secret)}?saved=1`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save profile.";
    return redirect(`/edit/${encodeURIComponent(secret)}?error=${encodeURIComponent(message)}`);
  }
};
