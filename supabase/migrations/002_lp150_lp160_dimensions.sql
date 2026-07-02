-- LINEO PRO CONDI 150/160: updated net and transport box dimensions
UPDATE public.logistics_products
SET
  height_cm = 24,
  width_cm = 29,
  length_cm = 103,
  transport_box_height_cm = 32,
  transport_box_width_cm = 110,
  transport_box_length_cm = 32
WHERE code IN ('LP150.320301', 'LP160.320301');
