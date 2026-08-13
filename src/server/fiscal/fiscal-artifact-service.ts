import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import type { PermissionKey } from "@/server/access/permissions";
import type { FiscalArtifacts } from "@/server/fiscal/fiscal-provider";

const BUCKET="fiscal-artifacts";
function permission(value:string){ return value as PermissionKey; }

export class FiscalArtifactService {
  static async store(input:{ organizationId:string;storeId:string;fiscalDocumentId:string;artifacts:FiscalArtifacts }){
    const xml=input.artifacts.xml??null; const pdf=input.artifacts.danfePdf??null; if(!xml) return null;
    const admin=createAdminClient(); const prefix=`${input.organizationId}/${input.storeId}/${input.fiscalDocumentId}`; const xmlPath=`${prefix}/document.xml`; const pdfPath=pdf?`${prefix}/danfe.pdf`:null;
    const xmlBytes=Buffer.from(xml,"utf8"); const xmlSha=createHash("sha256").update(xmlBytes).digest("hex");
    const xmlUpload=await admin.storage.from(BUCKET).upload(xmlPath,xmlBytes,{ upsert:true,contentType:"application/xml",cacheControl:"0" }); if(xmlUpload.error) throw xmlUpload.error;
    if(pdf&&pdfPath){ const pdfUpload=await admin.storage.from(BUCKET).upload(pdfPath,Buffer.from(pdf),{ upsert:true,contentType:"application/pdf",cacheControl:"0" }); if(pdfUpload.error) throw pdfUpload.error; }
    const { error }=await admin.rpc("fiscal_record_artifacts_internal",{ p_fiscal_document_id:input.fiscalDocumentId,p_xml_storage_path:xmlPath,p_danfe_storage_path:pdfPath,p_xml_sha256:xmlSha }); if(error) throw error;
    return { xmlPath,pdfPath,xmlSha };
  }

  static async signedUrls(fiscalDocumentId:string){
    const context=await authorize(permission("fiscal.view")); if(!context.storeId) throw new Error("Uma unidade ativa é necessária"); const admin=createAdminClient();
    const result=await admin.from("fiscal_documents").select("id,xml_storage_path,danfe_storage_path").eq("id",fiscalDocumentId).eq("organization_id",context.organizationId).eq("store_id",context.storeId).maybeSingle(); if(result.error) throw result.error; if(!result.data) throw new Error("Documento fiscal não encontrado nesta unidade");
    const output:{ xmlUrl:string|null;danfeUrl:string|null }={ xmlUrl:null,danfeUrl:null };
    if(result.data.xml_storage_path){ const signed=await admin.storage.from(BUCKET).createSignedUrl(result.data.xml_storage_path,120); if(signed.error) throw signed.error; output.xmlUrl=signed.data.signedUrl; }
    if(result.data.danfe_storage_path){ const signed=await admin.storage.from(BUCKET).createSignedUrl(result.data.danfe_storage_path,120); if(signed.error) throw signed.error; output.danfeUrl=signed.data.signedUrl; }
    return output;
  }
}
