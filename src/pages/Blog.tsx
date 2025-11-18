import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, ArrowRight, PenSquare } from "lucide-react";
import { format } from "date-fns";
import { Helmet } from "react-helmet";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  published_at: string;
  featured_image_url: string | null;
  tags: string[] | null;
  status: string;
  created_at: string;
}

const Blog = () => {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [drafts, setDrafts] = useState<BlogPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsAdmin(false);
        return;
      }

      // Check if user has admin role
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .single();
      
      setIsAdmin(!!roleData);
    };
    checkAuth();
  }, []);

  useEffect(() => {
    const fetchPosts = async () => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("id, title, slug, excerpt, published_at, featured_image_url, tags, status, created_at")
        .eq("status", "published")
        .order("published_at", { ascending: false });

      if (error) {
        console.error("Error fetching posts:", error);
      } else {
        setPosts(data || []);
      }
      setIsLoading(false);
    };

    fetchPosts();
  }, []);

  useEffect(() => {
    const fetchDrafts = async () => {
      if (!isAdmin) return;
      
      const { data, error } = await supabase
        .from("blog_posts")
        .select("id, title, slug, excerpt, published_at, featured_image_url, tags, status, created_at")
        .eq("status", "draft")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching drafts:", error);
      } else {
        setDrafts(data || []);
      }
    };

    fetchDrafts();
  }, [isAdmin]);

  return (
    <>
      <Helmet>
        <title>Golf Tips & Insights Blog | Holezy Golf</title>
        <meta name="description" content="Read the latest golf tips, booking guides, and course insights from Holezy Golf. Expert advice to improve your golf experience." />
        <meta property="og:title" content="Golf Tips & Insights Blog | Holezy Golf" />
        <meta property="og:description" content="Read the latest golf tips, booking guides, and course insights from Holezy Golf." />
        <meta property="og:type" content="website" />
        <link rel="canonical" href={window.location.href} />
      </Helmet>

      <div className="min-h-screen py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Holezy Golf Blog
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Golf tips, booking guides, and course insights to enhance your game
            </p>
            {isAdmin && (
              <Button asChild className="mt-6">
                <Link to="/blog/admin">
                  <PenSquare className="w-4 h-4 mr-2" />
                  Write New Post
                </Link>
              </Button>
            )}
          </div>

          {isAdmin && drafts.length > 0 && (
            <div className="mb-16">
              <h2 className="text-3xl font-bold mb-8">Your Drafts</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                {drafts.map((draft) => (
                  <Card key={draft.id} className="golf-card-shadow hover:shadow-lg transition-all duration-300 group border-2 border-dashed">
                    {draft.featured_image_url && (
                      <div className="overflow-hidden h-48">
                        <img
                          src={draft.featured_image_url}
                          alt={draft.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                    )}
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="text-xl font-semibold group-hover:text-primary transition-colors">
                          {draft.title}
                        </h3>
                        <Badge variant="secondary">Draft</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {format(new Date(draft.created_at), "MMM d, yyyy")}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-muted-foreground line-clamp-3">
                        {draft.excerpt || "No excerpt available"}
                      </p>
                      {draft.tags && draft.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {draft.tags.map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <Button variant="outline" asChild className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        <Link to={`/blog/admin?edit=${draft.id}`}>
                          Edit Draft
                          <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <h2 className="text-3xl font-bold mb-8">Published Posts</h2>

          {isLoading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <div className="h-48 bg-muted" />
                  <CardHeader>
                    <div className="h-6 bg-muted rounded w-3/4 mb-2" />
                    <div className="h-4 bg-muted rounded w-1/2" />
                  </CardHeader>
                  <CardContent>
                    <div className="h-4 bg-muted rounded mb-2" />
                    <div className="h-4 bg-muted rounded w-5/6" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : posts.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <p className="text-muted-foreground text-lg">
                  No blog posts yet. Check back soon!
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {posts.map((post) => (
                <Card key={post.id} className="golf-card-shadow hover:shadow-xl transition-shadow overflow-hidden group">
                  <Link to={`/blog/${post.slug}`}>
                    {post.featured_image_url ? (
                      <div className="h-48 overflow-hidden">
                        <img
                          src={post.featured_image_url}
                          alt={post.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                    ) : (
                      <div className="h-48 bg-gradient-to-br from-primary/20 to-primary/5" />
                    )}
                    <CardHeader>
                      <h2 className="text-2xl font-bold group-hover:text-primary transition-colors line-clamp-2">
                        {post.title}
                      </h2>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {format(new Date(post.published_at), "MMM d, yyyy")}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground line-clamp-3 mb-4">
                        {post.excerpt}
                      </p>
                      {post.tags && post.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {post.tags.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="secondary">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center text-primary font-semibold group-hover:translate-x-1 transition-transform">
                        Read More
                        <ArrowRight className="w-4 h-4 ml-1" />
                      </div>
                    </CardContent>
                  </Link>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Blog;