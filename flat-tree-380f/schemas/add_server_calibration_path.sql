ALTER TABLE servers ADD COLUMN calibration_path TEXT CHECK (
  calibration_path IS NULL OR
  calibration_path IN ('/arms2/calsensor.php', '/arms/calsensor.php')
);
