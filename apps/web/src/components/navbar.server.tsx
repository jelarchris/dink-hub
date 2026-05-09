import { getSessionUser } from "@/server/session";
import { Navbar } from "./navbar";

export async function NavbarServer() {
  const profile = await getSessionUser();
  return (
    <Navbar
      user={
        profile
          ? {
              email: profile.email,
              displayName: profile.displayName,
              role: profile.role,
            }
          : null
      }
    />
  );
}
