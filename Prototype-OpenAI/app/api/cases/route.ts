import { Simulator } from "@/lib/order-rescue-v2/simulator";
import { handle, owner } from "@/lib/http";
export const GET=()=>handle(async()=>{await owner();return new Simulator().listCases();});
