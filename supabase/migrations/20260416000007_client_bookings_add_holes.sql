ALTER TABLE public."Client_Bookings"
  ADD COLUMN IF NOT EXISTS number_of_holes INTEGER NOT NULL DEFAULT 18
    CHECK (number_of_holes IN (9, 18));
