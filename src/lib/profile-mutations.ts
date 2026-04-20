import { getServerSupabaseClient } from "@/lib/supabase";
import {
  deleteProfilePicture,
  findProfileByEditSecretHash,
  resolveSocialPhotoUrl,
  uploadProfilePicture,
  uploadProfilePictureFromUrl,
} from "@/lib/profiles";
import { generateEditSecret, hashEditSecret } from "@/lib/secrets";

type ProfileFormValues = {
  name: string;
  aboutMe: string;
  linkedinUrl: string | null;
  twitterUrl: string | null;
  publicEmail: string | null;
  photo: File | null;
};

function getText(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function optional(value: string): string | null {
  return value ? value : null;
}

function fileFromForm(formData: FormData, key: string): File | null {
  const file = formData.get(key);
  if (!(file instanceof File) || file.size === 0) {
    return null;
  }

  return file;
}

function normalizeAbsoluteUrl(value: string): string {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http and https URLs are supported.");
  }

  return parsed.toString();
}

function normalizeLinkedInInput(value: string | null): string | null {
  if (!value) return null;

  try {
    return normalizeAbsoluteUrl(value);
  } catch {
    const match = value.match(/^@?([A-Za-z0-9][A-Za-z0-9._-]{0,99})$/);
    if (match) {
      return `https://www.linkedin.com/in/${match[1]}`;
    }

    throw new Error("Enter a full LinkedIn URL or a LinkedIn profile slug.");
  }
}

function normalizeTwitterInput(value: string | null): string | null {
  if (!value) return null;

  try {
    return normalizeAbsoluteUrl(value);
  } catch {
    const match = value.match(/^@?([A-Za-z0-9_]{1,15})$/);
    if (match) {
      return `https://x.com/${match[1]}`;
    }

    throw new Error("Enter a full X/Twitter URL or username.");
  }
}

function parseForm(formData: FormData): ProfileFormValues {
  const name = getText(formData, "name");
  const aboutMe = getText(formData, "about_me");
  const linkedinUrl = normalizeLinkedInInput(optional(getText(formData, "linkedin_url")));
  const twitterUrl = normalizeTwitterInput(optional(getText(formData, "twitter_url")));
  const publicEmail = optional(getText(formData, "public_email"));
  const photo = fileFromForm(formData, "photo");

  return {
    name,
    aboutMe,
    linkedinUrl,
    twitterUrl,
    publicEmail,
    photo,
  };
}

function assertRequiredProfileInput(values: ProfileFormValues) {
  if (!values.name || !values.aboutMe) {
    throw new Error("Name and about me are required.");
  }
}

async function getAutoPhoto(profileId: string, values: ProfileFormValues) {
  const socialPhotoUrl = await resolveSocialPhotoUrl(
    values.linkedinUrl,
    values.twitterUrl
  );

  if (!socialPhotoUrl) {
    return null;
  }

  try {
    return await uploadProfilePictureFromUrl(profileId, socialPhotoUrl);
  } catch {
    return null;
  }
}

export async function createProfile(formData: FormData): Promise<string> {
  const supabase = getServerSupabaseClient();
  const values = parseForm(formData);
  assertRequiredProfileInput(values);

  const secret = generateEditSecret();
  const editSecretHash = hashEditSecret(secret);

  const { data, error } = await supabase
    .from("profiles")
    .insert({
      name: values.name,
      about_me: values.aboutMe,
      linkedin_url: values.linkedinUrl,
      twitter_url: values.twitterUrl,
      public_email: values.publicEmail,
      edit_secret_hash: editSecretHash,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error("Unable to create profile.");
  }

  let photoUrl: string | null = null;
  if (values.photo) {
    photoUrl = await uploadProfilePicture(data.id, values.photo);
  } else if (values.linkedinUrl || values.twitterUrl) {
    photoUrl = await getAutoPhoto(data.id, values);
  }

  if (photoUrl) {
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ photo_url: photoUrl })
      .eq("id", data.id);

    if (updateError) {
      throw new Error("Unable to attach photo to profile.");
    }
  }

  return secret;
}

export async function saveProfile(secret: string, formData: FormData): Promise<void> {
  const supabase = getServerSupabaseClient();
  const values = parseForm(formData);
  assertRequiredProfileInput(values);

  const editSecretHash = hashEditSecret(secret);
  const profile = await findProfileByEditSecretHash(editSecretHash);

  if (!profile) {
    throw new Error("Invalid edit link");
  }

  let photoUrl = profile.photo_url;
  if (values.photo) {
    photoUrl = await uploadProfilePicture(profile.id, values.photo);
  } else if (!photoUrl && (values.linkedinUrl || values.twitterUrl)) {
    photoUrl = await getAutoPhoto(profile.id, values);
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      name: values.name,
      about_me: values.aboutMe,
      linkedin_url: values.linkedinUrl,
      twitter_url: values.twitterUrl,
      public_email: values.publicEmail,
      photo_url: photoUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.id);

  if (error) {
    throw new Error("Unable to save profile.");
  }
}

export async function deleteProfile(secret: string): Promise<void> {
  const supabase = getServerSupabaseClient();
  const editSecretHash = hashEditSecret(secret);
  const profile = await findProfileByEditSecretHash(editSecretHash);

  if (!profile) {
    throw new Error("Invalid edit link");
  }

  const { error } = await supabase.from("profiles").delete().eq("id", profile.id);

  if (error) {
    throw new Error("Unable to delete profile.");
  }

  try {
    await deleteProfilePicture(profile.photo_url);
  } catch {
    // Best-effort storage cleanup after the profile row has been removed.
  }
}
