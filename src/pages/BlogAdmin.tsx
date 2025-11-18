import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { ImageUpload } from "@/components/ImageUpload";

const BlogAdmin = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    slug: "",
    content: "",
    excerpt: "",
    featured_image_url: "",
    meta_description: "",
    tags: "",
    status: "draft" as "draft" | "published",
  });

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication Required",
          description: "Please log in to create blog posts.",
          variant: "destructive",
        });
        navigate("/auth");
        return;
      }

      // Check if user has admin role
      const { data: roleData, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .single();

      if (error || !roleData) {
        toast({
          title: "Access Denied",
          description: "You don't have permission to manage blog posts.",
          variant: "destructive",
        });
        navigate("/blog");
      }
    };
    checkAuth();
  }, [navigate, toast]);

  useEffect(() => {
    if (editId) {
      const fetchPost = async () => {
        const { data, error } = await supabase
          .from("blog_posts")
          .select("*")
          .eq("id", editId)
          .single();

        if (error) {
          toast({
            title: "Error",
            description: "Failed to load post",
            variant: "destructive",
          });
          return;
        }

        setFormData({
          title: data.title,
          slug: data.slug,
          content: data.content,
          excerpt: data.excerpt || "",
          featured_image_url: data.featured_image_url || "",
          meta_description: data.meta_description || "",
          tags: data.tags?.join(", ") || "",
          status: (data.status as "draft" | "published") || "draft",
        });
      };
      fetchPost();
    }
  }, [editId, toast]);

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
  };

  const handleTitleChange = (title: string) => {
    setFormData((prev) => ({
      ...prev,
      title,
      slug: prev.slug || generateSlug(title),
    }));
  };

  const handleSubmit = async (status: "draft" | "published") => {
    if (!formData.title || !formData.content || !formData.slug) {
      toast({
        title: "Missing Information",
        description: "Please fill in title, slug, and content",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const postData = {
        title: formData.title,
        slug: formData.slug,
        content: formData.content,
        excerpt: formData.excerpt,
        featured_image_url: formData.featured_image_url || null,
        meta_description: formData.meta_description || null,
        tags: formData.tags ? formData.tags.split(",").map((t) => t.trim()) : null,
        status,
        author_id: user.id,
        author_name: user.user_metadata?.first_name 
          ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ""}`.trim()
          : user.email || "Anonymous",
        published_at: status === "published" ? new Date().toISOString() : null,
      };

      let error;
      if (editId) {
        ({ error } = await supabase
          .from("blog_posts")
          .update(postData)
          .eq("id", editId));
      } else {
        ({ error } = await supabase
          .from("blog_posts")
          .insert([postData]));
      }

      if (error) throw error;

      toast({
        title: "Success!",
        description: `Post ${status === "published" ? "published" : "saved as draft"}`,
      });

      navigate("/blog");
    } catch (error) {
      console.error("Error saving post:", error);
      toast({
        title: "Error",
        description: "Failed to save post",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <Button variant="ghost" asChild className="mb-8">
          <Link to="/blog">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Blog
          </Link>
        </Button>

        <Card className="golf-card-shadow">
          <CardHeader>
            <CardTitle className="text-3xl">
              {editId ? "Edit Blog Post" : "Create New Blog Post"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Enter post title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">URL Slug *</Label>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                placeholder="url-friendly-slug"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="excerpt">Excerpt</Label>
              <Textarea
                id="excerpt"
                value={formData.excerpt}
                onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
                placeholder="Brief summary for preview"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Content *</Label>
              <Textarea
                id="content"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="Write your post content here..."
                rows={15}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="featured_image">Featured Image</Label>
              <ImageUpload
                onImageUploaded={(url) => setFormData({ ...formData, featured_image_url: url })}
                currentImage={formData.featured_image_url}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="meta_description">Meta Description (SEO)</Label>
              <Textarea
                id="meta_description"
                value={formData.meta_description}
                onChange={(e) => setFormData({ ...formData, meta_description: e.target.value })}
                placeholder="SEO description (max 160 characters)"
                rows={2}
                maxLength={160}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                placeholder="golf, tips, booking"
              />
            </div>

            <div className="flex gap-4">
              <Button
                onClick={() => handleSubmit("draft")}
                disabled={isLoading}
                variant="outline"
                className="flex-1"
              >
                <Save className="w-4 h-4 mr-2" />
                Save as Draft
              </Button>
              <Button
                onClick={() => handleSubmit("published")}
                disabled={isLoading}
                className="flex-1"
              >
                <Eye className="w-4 h-4 mr-2" />
                Publish
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BlogAdmin;