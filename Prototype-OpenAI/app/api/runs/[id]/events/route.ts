import { handle, owner } from "@/lib/http";
import { HttpError } from "@/lib/order-rescue-v2/repository";
export const POST=()=>handle(async()=>{await owner();throw new HttpError(409,"v2.2 uses a buyer reply or manual No reply. Start a v2.2 review to continue.");});
