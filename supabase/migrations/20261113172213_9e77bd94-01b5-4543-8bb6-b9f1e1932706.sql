DELETE FROM public.onboarding_items
WHERE clave IN ('resend_cuenta','resend_api_key','resend_dominio','twilio_cuenta','twilio_credentials','twilio_whatsapp')
  AND NOT EXISTS (SELECT 1 FROM public.onboarding_archivos a WHERE a.item_id = onboarding_items.id);