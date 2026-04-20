import type { APIRoute } from "astro";
import { createProfile } from "@/lib/profile-mutations";

export const prerender = false;

function redirect(location: string) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: location,
    },
  });
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const secret = await createProfile(formData);
    return redirect(`/create/success?secret=${encodeURIComponent(secret)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create profile.";
    return redirect(`/create?error=${encodeURIComponent(message)}`);
  }
};
