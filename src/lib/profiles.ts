import { randomUUID } from "crypto";
import { getServerSupabaseClient } from "@/lib/supabase";

export type Profile = {
  id: string;
  name: string;
  about_me: string;
  role: string | null;
  photo_url: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  public_email: string | null;
  edit_secret_hash: string;
  created_at: string;
  updated_at: string;
};

type ListProfilesPageOptions = {
  search?: string;
  page?: number;
  pageSize?: number;
};

export async function listProfiles(): Promise<Profile[]> {
  const supabase = getServerSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, name, about_me, role, photo_url, linkedin_url, twitter_url, public_email, edit_secret_hash, created_at, updated_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    if ((error as { code?: string }).code === "42P01") {
      throw new Error(
        "Database table missing: public.profiles was not found. Run supabase/schema.sql in your Supabase SQL editor."
      );
    }

    throw new Error(`Failed to load profiles: ${error.message}`);
  }

  return data ?? [];
}

export async function listProfilesPage(
  options: ListProfilesPageOptions = {}
): Promise<{ profiles: Profile[]; totalCount: number }> {
  const supabase = getServerSupabaseClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, options.pageSize ?? 12);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const search = options.search?.trim() ?? "";

  let query = supabase
    .from("profiles")
    .select(
      "id, name, about_me, role, photo_url, linkedin_url, twitter_url, public_email, edit_secret_hash, created_at, updated_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    if ((error as { code?: string }).code === "42P01") {
      throw new Error(
        "Database table missing: public.profiles was not found. Run supabase/schema.sql in your Supabase SQL editor."
      );
    }

    throw new Error(`Failed to load profiles: ${error.message}`);
  }

  return {
    profiles: data ?? [],
    totalCount: count ?? 0,
  };
}

export async function findProfileByEditSecretHash(
  editSecretHash: string
): Promise<Profile | null> {
  const supabase = getServerSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, name, about_me, role, photo_url, linkedin_url, twitter_url, public_email, edit_secret_hash, created_at, updated_at"
    )
    .eq("edit_secret_hash", editSecretHash)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to find profile: ${error.message}`);
  }

  return data ?? null;
}

export async function uploadProfilePicture(
  profileId: string,
  photo: File
): Promise<string> {
  const supabase = getServerSupabaseClient();
  const extension =
    photo.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const filePath = `${profileId}/${randomUUID()}.${extension}`;
  const buffer = Buffer.from(await photo.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from("profile-pictures")
    .upload(filePath, buffer, {
      contentType: photo.type || "application/octet-stream",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Failed to upload photo: ${uploadError.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("profile-pictures").getPublicUrl(filePath);

  if (!publicUrl) {
    throw new Error("Uploaded photo is missing a public URL.");
  }

  return publicUrl;
}

function toImageExtensionFromContentType(contentType: string | null): string {
  if (!contentType) return "jpg";

  const [mime] = contentType.toLowerCase().split(";");
  const normalized = mime.trim();

  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/gif") return "gif";

  return "jpg";
}

function safePublicImageUrl(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.includes("/profile_banners/")) return null;

  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;

    const host = parsed.hostname.toLowerCase();
    if (["pbs.twimg.com", "media.licdn.com"].includes(host)) {
      return trimmed;
    }

    if (
      host.endsWith("twimg.com") ||
      host.endsWith("licdn.com") ||
      host.includes("googleusercontent.com") ||
      host.includes("cdn.") ||
      /\.(jpg|jpeg|png|webp|gif)$/i.test(trimmed)
    ) {
      return trimmed;
    }
  } catch {
    return null;
  }

  return null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#34;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function extractImageFromHtml(html: string): string | null {
  const normalized = decodeHtmlEntities(html);
  const patterns = [
    /"profile_image_url_https"\s*:\s*"([^"]+)"/i,
    /"profile_image_url"\s*:\s*"([^"]+)"/i,
    /"avatar_url"\s*:\s*"([^"]+)"/i,
    /<img[^>]+src=["']([^"']*media\.licdn\.com[^"']+)["'][^>]*>/i,
    /<img[^>]+src=["']([^"']*pbs\.twimg\.com\/profile_images[^"']+)["'][^>]*>/i,
    /<img[^>]+src=["']([^"']*profile_images[^"']+)["'][^>]*>/i,
    /<meta[^>]+property=["']og:image[:a-z-]*["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:image[^"']*["'][^>]+content=["']([^"']+)["']/i,
    /background-image:\s*url\(["'](https?:\/\/[^"']*profile_images[^"')]+)["']\)/i,
    /"contentUrl"\s*:\s*"([^"]+)"/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

async function resolveSocialImageFromPage(url: string): Promise<string | null> {
  if (!url) return null;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ev-london-attendees-bot/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) return null;

    const html = await response.text();
    const image = extractImageFromHtml(html);
    if (!image) return null;

    const absolute = new URL(image, url).href;
    return safePublicImageUrl(absolute);
  } catch {
    return null;
  }
}

function socialHandleFromTwitterUrl(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    if (!host.includes("x.com") && !host.includes("twitter.com")) return null;

    const segment = url.pathname.split("/").filter(Boolean);
    if (segment.length === 0) return null;
    if (segment[0].toLowerCase() === "photo") return null;

    return segment[0];
  } catch {
    const usernameMatch = trimmed.match(/^@?([A-Za-z0-9_]{1,15})$/);
    if (usernameMatch) return usernameMatch[1];

    return null;
  }
}

function socialHandleFromLinkedInUrl(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    if (!host.includes("linkedin.com")) return null;

    const segment = url.pathname.split("/").filter(Boolean);
    if (segment[0]?.toLowerCase() === "in" && segment[1]) return segment[1];
    if (segment[0]?.toLowerCase() === "company" && segment[1]) return segment[1];

    return null;
  } catch {
    const usernameMatch = trimmed.match(/^@?([A-Za-z0-9][A-Za-z0-9._-]{0,99})$/);
    if (usernameMatch) return usernameMatch[1];

    return null;
  }
}

function normalizeTwitterProfileUrl(value: string | null): string | null {
  const handle = socialHandleFromTwitterUrl(value);
  if (!handle) return null;

  return `https://x.com/${encodeURIComponent(handle)}`;
}

function normalizeLinkedInProfileUrl(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    if (!host.includes("linkedin.com")) return null;

    const segments = url.pathname.split("/").filter(Boolean);
    const scope = segments[0]?.toLowerCase();
    const handle = segments[1];

    if ((scope === "in" || scope === "company") && handle) {
      return `https://www.linkedin.com/${scope}/${encodeURIComponent(handle)}`;
    }

    return trimmed;
  } catch {
    const handle = socialHandleFromLinkedInUrl(trimmed);
    if (!handle) return null;

    return `https://www.linkedin.com/in/${encodeURIComponent(handle)}`;
  }
}

async function deriveAvatarSourceFromSocial(
  linkedinUrl: string | null,
  twitterUrl: string | null
): Promise<string | null> {
  const directImage = safePublicImageUrl(twitterUrl) || safePublicImageUrl(linkedinUrl);
  if (directImage) return directImage;

  if (twitterUrl) {
    const normalizedTwitter = normalizeTwitterProfileUrl(twitterUrl);
    const linkedImage = await resolveSocialImageFromPage(
      normalizedTwitter || twitterUrl
    );

    if (linkedImage) return linkedImage;
  }

  if (linkedinUrl) {
    const normalizedLinkedIn = normalizeLinkedInProfileUrl(linkedinUrl);
    const linkedImage = await resolveSocialImageFromPage(
      normalizedLinkedIn || linkedinUrl
    );

    if (linkedImage) return linkedImage;
  }

  const twitterHandle = socialHandleFromTwitterUrl(twitterUrl);
  if (twitterHandle) {
    return `https://unavatar.io/x/${encodeURIComponent(twitterHandle)}`;
  }

  const linkedInHandle = socialHandleFromLinkedInUrl(linkedinUrl);
  if (linkedInHandle) {
    return `https://unavatar.io/linkedin/${encodeURIComponent(linkedInHandle)}`;
  }

  return null;
}

export async function resolveSocialPhotoUrl(
  linkedinUrl: string | null,
  twitterUrl: string | null
): Promise<string | null> {
  return deriveAvatarSourceFromSocial(linkedinUrl, twitterUrl);
}

export async function uploadProfilePictureFromUrl(
  profileId: string,
  photoUrl: string
): Promise<string> {
  const supabase = getServerSupabaseClient();

  const response = await fetch(photoUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ev-london-attendees-bot/1.0)",
      Accept: "image/*",
    },
  });

  if (!response.ok) {
    throw new Error(`Could not download photo: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.toLowerCase().startsWith("image/")) {
    throw new Error("Downloaded content is not an image.");
  }

  const extension = toImageExtensionFromContentType(contentType);
  const filePath = `${profileId}/${randomUUID()}.${extension}`;
  const buffer = Buffer.from(await response.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from("profile-pictures")
    .upload(filePath, buffer, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Failed to upload remote photo: ${uploadError.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("profile-pictures").getPublicUrl(filePath);

  if (!publicUrl) {
    throw new Error("Uploaded remote photo is missing a public URL.");
  }

  return publicUrl;
}

function getProfilePictureStoragePath(photoUrl: string | null): string | null {
  const trimmed = photoUrl?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const marker = "/storage/v1/object/public/profile-pictures/";
    const start = url.pathname.indexOf(marker);
    if (start === -1) return null;

    return decodeURIComponent(url.pathname.slice(start + marker.length));
  } catch {
    return null;
  }
}

export async function deleteProfilePicture(photoUrl: string | null): Promise<void> {
  const filePath = getProfilePictureStoragePath(photoUrl);
  if (!filePath) {
    return;
  }

  const supabase = getServerSupabaseClient();
  const { error } = await supabase.storage.from("profile-pictures").remove([filePath]);

  if (error) {
    throw new Error(`Failed to delete photo: ${error.message}`);
  }
}
