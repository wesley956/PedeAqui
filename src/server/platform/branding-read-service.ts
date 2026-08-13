import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type ResolvedBranding={
  productName:string;
  logoUrl:string|null;
  primaryColor:string|null;
  secondaryColor:string|null;
  hidePedeAquiBranding:boolean;
};

const fallback:ResolvedBranding={ productName:"PedeAqui",logoUrl:null,primaryColor:null,secondaryColor:null,hidePedeAquiBranding:false };

export class BrandingReadService{
  static async resolve(organizationId:string):Promise<ResolvedBranding>{
    const admin=createAdminClient();
    const [{ data:entitlement,error:entitlementError },{ data:branding,error:brandingError }]=await Promise.all([
      admin.rpc("organization_entitlement_internal",{ p_organization_id:organizationId,p_feature_key:"branding.white_label",p_at:new Date().toISOString() }),
      admin.from("organization_branding").select("white_label_enabled,product_name,logo_asset_ref,primary_color,secondary_color,hide_pedeaqui_branding").eq("organization_id",organizationId).maybeSingle(),
    ]);
    if(entitlementError) throw entitlementError;
    if(brandingError) throw brandingError;
    if(!entitlement?.enabled||!branding?.white_label_enabled) return fallback;
    const logoRef=typeof branding.logo_asset_ref==="string"?branding.logo_asset_ref.trim():"";
    const safeLogo=/^(https:\/\/|\/)/.test(logoRef)?logoRef:null;
    return {
      productName:branding.product_name?.trim()||"PedeAqui",
      logoUrl:safeLogo,
      primaryColor:branding.primary_color??null,
      secondaryColor:branding.secondary_color??null,
      hidePedeAquiBranding:Boolean(branding.hide_pedeaqui_branding),
    };
  }
}
