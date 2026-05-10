import { createAdminLogoutResponse } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function POST() {
  return createAdminLogoutResponse();
}
