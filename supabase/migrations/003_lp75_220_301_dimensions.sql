-- LP75.220.301: align transport box dimensions with LP90.220.301 for identical stacking
UPDATE public.logistics_products
SET
  height_cm = 24,
  width_cm = 124,
  length_cm = 19,
  transport_box_height_cm = 24,
  transport_box_length_cm = 124,
  transport_box_width_cm = 19
WHERE code = 'LP75.220.301';
