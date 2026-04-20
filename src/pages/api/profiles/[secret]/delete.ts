import type { APIRoute } from "astro";
import { deleteProfile } from "@/lib/profile-mutations";

export const prerender = false;

function redirect(location: string) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: location,
    },
  });
}

export const POST: APIRoute = async ({ params }) => {
  const secret = params.secret;
  if (!secret) {
    return redirect("/");
  }

  try {
    await deleteProfile(secret);
    return redirect("/?deleted=1");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete profile.";
    return redirect(`/edit/${encodeURIComponent(secret)}?error=${encodeURIComponent(message)}`);
  }
};
