-- Make the HolezyGolf bucket public so tutorial videos are accessible
UPDATE storage.buckets 
SET public = true 
WHERE id = 'HolezyGolf';

-- Add RLS policy to allow public access to read objects in HolezyGolf bucket
CREATE POLICY "Public read access for HolezyGolf bucket"
ON storage.objects
FOR SELECT
USING (bucket_id = 'HolezyGolf');