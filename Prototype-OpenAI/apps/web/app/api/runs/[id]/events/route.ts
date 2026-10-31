import { handle, owner } from "@web/lib/http";
import { HttpError } from "@web/lib/infrastructure/order-rescue-repository";
export const POST=()=>handle(async()=>{await owner();throw new HttpError(409,"v2.2 uses a buyer reply or manual No reply. Start a v2.2 review to continue.");});
