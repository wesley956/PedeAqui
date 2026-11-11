ALTER TABLE public.store_menu_settings ADD COLUMN IF NOT EXISTS allow_item_notes boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.store_menu_settings.allow_item_notes IS 'Allow customers to enter product notes in the online menu';
