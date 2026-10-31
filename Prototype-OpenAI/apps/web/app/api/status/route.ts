import { status } from "@web/lib/application/runs-service";
import { handle, owner } from "@web/lib/http";
export const GET = () => handle(async () => { await owner(); return status(); });
