export function moderationErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("you cannot moderate your own account"))
    return "You cannot moderate your own account.";
  if (message.includes("only the super-admin can moderate admins"))
    return "Only the super-admin can moderate admins.";
  if (message.includes("super-admin account is protected"))
    return "The super-admin account cannot be moderated.";
  if (message.includes("already banned")) return "This user is already banned.";
  if (message.includes("no linked geofs id"))
    return "This RT account has no linked GeoFS ID.";
  if (message.includes("user not found"))
    return "This RT account could not be found.";
  if (message.includes("unauthorized"))
    return "Your admin session has expired. Sign in again.";

  return fallback;
}
