-- A settings row means the shop has that channel.
-- enabled follows the live toggle, including when it is currently off.

INSERT INTO provider_capabilities (provider_id, capability, enabled)
SELECT pl.provider_id, 'FAMILY_DINNER', bool_or(s.enabled)
FROM family_dinner_provider_settings s
JOIN provider_locations pl ON pl.id = s.provider_location_id
GROUP BY pl.provider_id
ON CONFLICT (provider_id, capability) DO UPDATE
SET enabled = EXCLUDED.enabled, updated_at = now();

INSERT INTO provider_capabilities (provider_id, capability, enabled)
SELECT pl.provider_id, 'BREAKFAST_PREORDER', bool_or(s.enabled)
FROM breakfast_preorder_provider_settings s
JOIN provider_locations pl ON pl.id = s.provider_location_id
GROUP BY pl.provider_id
ON CONFLICT (provider_id, capability) DO UPDATE
SET enabled = EXCLUDED.enabled, updated_at = now();

INSERT INTO provider_capabilities (provider_id, capability, enabled)
SELECT pl.provider_id, 'LATE_NIGHT', bool_or(s.enabled)
FROM late_night_provider_settings s
JOIN provider_locations pl ON pl.id = s.provider_location_id
GROUP BY pl.provider_id
ON CONFLICT (provider_id, capability) DO UPDATE
SET enabled = EXCLUDED.enabled, updated_at = now();
