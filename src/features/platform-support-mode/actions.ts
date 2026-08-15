"use server";
import { redirect } from "next/navigation";
import { PlatformSupportModeService } from "@/server/platform/platform-support-mode-service";
const text=(f:FormData,k:string)=>{const v=f.get(k);return typeof v==="string"?v.trim():"";};
export async function startSupportModeAction(form:FormData){await PlatformSupportModeService.start({organizationId:text(form,"organizationId"),storeId:text(form,"storeId"),roleId:text(form,"roleId")||null,reason:text(form,"reason"),protocol:text(form,"protocol")});redirect("/platform/suporte/modo");}
export async function endSupportModeAction(){await PlatformSupportModeService.end();redirect("/platform/suporte/modo");}
