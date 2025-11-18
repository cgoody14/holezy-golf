import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageCropDialog } from "./ImageCropDialog";

interface ImageUploadProps {
  onImageUploaded: (url: string) => void;
  currentImage?: string;
}

export const ImageUpload = ({ onImageUploaded, currentImage }: ImageUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(currentImage);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [tempImageUrl, setTempImageUrl] = useState<string>("");
  const { toast } = useToast();

  const validateAndShowCrop = (file: File) => {
    // Validate file type
    const validImageTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
    const fileExtension = file.name.toLowerCase().split(".").pop();
    
    // Block HEIC files specifically as they're not browser-supported
    if (fileExtension === "heic" || fileExtension === "heif") {
      toast({
        title: "HEIC format not supported",
        description: "Please convert your image to JPG or PNG first",
        variant: "destructive",
      });
      return;
    }
    
    if (!validImageTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload JPG, PNG, WebP, or GIF images",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 5MB",
        variant: "destructive",
      });
      return;
    }

    // Create preview URL for cropping
    const url = URL.createObjectURL(file);
    setTempImageUrl(url);
    setCropDialogOpen(true);
  };

  const uploadImage = async (blob: Blob) => {
    try {
      setIsUploading(true);

      const fileExt = "jpg";
      const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const file = new File([blob], fileName, { type: "image/jpeg" });

      const { error: uploadError } = await supabase.storage
        .from("blog-images")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("blog-images")
        .getPublicUrl(filePath);

      setPreviewUrl(publicUrl);
      onImageUploaded(publicUrl);

      toast({
        title: "Success!",
        description: "Image uploaded successfully",
      });
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: "Failed to upload image",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      validateAndShowCrop(file);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndShowCrop(file);
    }
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    setCropDialogOpen(false);
    URL.revokeObjectURL(tempImageUrl);
    await uploadImage(croppedBlob);
  };

  const handleCropCancel = () => {
    setCropDialogOpen(false);
    URL.revokeObjectURL(tempImageUrl);
    setTempImageUrl("");
  };

  const handleRemove = () => {
    setPreviewUrl(undefined);
    onImageUploaded("");
  };

  return (
    <div className="space-y-4">
      <ImageCropDialog
        open={cropDialogOpen}
        imageUrl={tempImageUrl}
        onCropComplete={handleCropComplete}
        onCancel={handleCropCancel}
      />
      {previewUrl ? (
        <div className="relative">
          <img
            src={previewUrl}
            alt="Preview"
            className="w-full h-48 object-cover rounded-lg"
          />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2"
            onClick={handleRemove}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50"
          }`}
        >
          {isUploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Uploading...</p>
            </div>
          ) : (
            <>
              <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-2">
                Drag and drop an image here, or click to select
              </p>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
                id="image-upload"
              />
              <label htmlFor="image-upload">
                <Button type="button" variant="outline" asChild>
                  <span>Select Image</span>
                </Button>
              </label>
              <p className="text-xs text-muted-foreground mt-2">
                Max file size: 5MB
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
};
