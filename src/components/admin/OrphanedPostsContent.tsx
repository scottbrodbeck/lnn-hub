import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { Link2, Eye, Send, RefreshCw, AlertCircle, Trash2, Archive } from 'lucide-react';
import { LinkOrphanedPostDialog } from '@/components/LinkOrphanedPostDialog';
import { SubmittedPostPreview } from '@/components/SubmittedPostPreview';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface OrphanedPost {
  id: string;
  headline: string;
  created_at: string;
  updated_at: string;
  status: string;
  client_id: string;
  wordpress_post_id: number | null;
  wordpress_post_url: string | null;
  client?: {
    full_name: string | null;
    email: string;
    organization_id: string | null;
  };
}

interface OrphanedPostsContentProps {
  onCountChange?: (count: number) => void;
}

export function OrphanedPostsContent({ onCountChange }: OrphanedPostsContentProps) {
  const [orphanedPosts, setOrphanedPosts] = useState<OrphanedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<OrphanedPost | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [previewPostId, setPreviewPostId] = useState<string | null>(null);
  const [publishingPostId, setPublishingPostId] = useState<string | null>(null);
  
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  useEffect(() => {
    fetchOrphanedPosts();
  }, []);

  const fetchOrphanedPosts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('posts')
        .select(`
          id,
          headline,
          created_at,
          updated_at,
          status,
          client_id,
          assignment_ids,
          wordpress_post_id,
          wordpress_post_url,
          client:profiles!posts_client_id_fkey(full_name, email, organization_id)
        `)
        .eq('status', 'published')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const orphaned = (data || []).filter(post => {
        return !post.assignment_ids || post.assignment_ids.length === 0;
      });

      setOrphanedPosts(orphaned);
      setSelectedPostIds(new Set());
      onCountChange?.(orphaned.length);
    } catch (error) {
      console.error('Error fetching orphaned posts:', error);
      toast.error('Failed to load orphaned posts');
    } finally {
      setLoading(false);
    }
  };

  const handleLinkSuccess = async () => {
    setLinkDialogOpen(false);
    setSelectedPost(null);
    await fetchOrphanedPosts();
    toast.success('Post linked to assignment successfully');
  };

  const handleTriggerWordPress = async (post: OrphanedPost) => {
    setPublishingPostId(post.id);
    try {
      const { data: postData, error: postError } = await supabase
        .from('posts')
        .select('assignment_ids')
        .eq('id', post.id)
        .single();

      if (postError) throw postError;

      if (!postData.assignment_ids || postData.assignment_ids.length === 0) {
        toast.error('Post must be linked to an assignment first');
        return;
      }

      const { data: assignment, error: assignmentError } = await supabase
        .from('post_assignments')
        .select('site_id')
        .eq('id', postData.assignment_ids[0])
        .single();

      if (assignmentError) throw assignmentError;

      if (!assignment?.site_id) {
        toast.error('Could not find site for this assignment');
        return;
      }

      const { error: wpError } = await supabase.functions.invoke('publish-to-wordpress', {
        body: {
          mode: 'publish',
          site_id: assignment.site_id,
          post_id: post.id
        }
      });

      if (wpError) throw wpError;

      toast.success('WordPress draft created successfully');
      await fetchOrphanedPosts();
    } catch (error: any) {
      console.error('WordPress publish error:', error);
      toast.error('Failed to create WordPress draft: ' + error.message);
    } finally {
      setPublishingPostId(null);
    }
  };

  const togglePostSelection = (postId: string) => {
    const newSelected = new Set(selectedPostIds);
    if (newSelected.has(postId)) {
      newSelected.delete(postId);
    } else {
      newSelected.add(postId);
    }
    setSelectedPostIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedPostIds.size === orphanedPosts.length) {
      setSelectedPostIds(new Set());
    } else {
      setSelectedPostIds(new Set(orphanedPosts.map(p => p.id)));
    }
  };

  const handleBulkDelete = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .in('id', Array.from(selectedPostIds));

      if (error) throw error;

      toast.success(`Deleted ${selectedPostIds.size} orphaned post${selectedPostIds.size !== 1 ? 's' : ''}`);
      setSelectedPostIds(new Set());
      setShowDeleteConfirm(false);
      await fetchOrphanedPosts();
    } catch (error: any) {
      console.error('Delete error:', error);
      toast.error('Failed to delete posts: ' + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkArchive = async () => {
    setIsArchiving(true);
    try {
      const { error } = await supabase
        .from('posts')
        .update({ status: 'archived' as any })
        .in('id', Array.from(selectedPostIds));

      if (error) throw error;

      toast.success(`Archived ${selectedPostIds.size} orphaned post${selectedPostIds.size !== 1 ? 's' : ''}`);
      setSelectedPostIds(new Set());
      setShowArchiveConfirm(false);
      await fetchOrphanedPosts();
    } catch (error: any) {
      console.error('Archive error:', error);
      toast.error('Failed to archive posts: ' + error.message);
    } finally {
      setIsArchiving(false);
    }
  };

  const isAllSelected = orphanedPosts.length > 0 && selectedPostIds.size === orphanedPosts.length;
  const isSomeSelected = selectedPostIds.size > 0;

  if (loading) {
    return (
      <div className="py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-1/4 mb-4"></div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-muted-foreground">
          Published posts without assignment links. Link them to assignments and trigger WordPress publishing.
        </p>
        <Button variant="outline" onClick={fetchOrphanedPosts}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {orphanedPosts.length === 0 ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No orphaned posts found</AlertTitle>
          <AlertDescription>
            All published posts are properly linked to assignments. Great job!
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Action Required</AlertTitle>
            <AlertDescription>
              Found {orphanedPosts.length} post{orphanedPosts.length !== 1 ? 's' : ''} without assignment links. 
              These posts need to be linked to assignments before they can be published to WordPress.
            </AlertDescription>
          </Alert>

          {isSomeSelected && (
            <div className="flex items-center gap-4 p-3 bg-muted/50 border border-border rounded-lg">
              <span className="text-sm font-medium">
                {selectedPostIds.size} of {orphanedPosts.length} selected
              </span>
              <div className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowArchiveConfirm(true)}
                disabled={isArchiving}
              >
                <Archive className="mr-2 h-4 w-4" />
                Archive Selected
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isDeleting}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Selected
              </Button>
            </div>
          )}

          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="p-4 w-12">
                    <Checkbox
                      checked={isAllSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="text-left p-4 font-semibold">Headline</th>
                  <th className="text-left p-4 font-semibold">Client</th>
                  <th className="text-left p-4 font-semibold">Submitted</th>
                  <th className="text-left p-4 font-semibold">Age</th>
                  <th className="text-left p-4 font-semibold">WordPress</th>
                  <th className="text-left p-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orphanedPosts.map((post) => {
                  const isSelected = selectedPostIds.has(post.id);
                  const postAge = formatDistanceToNow(parseISO(post.created_at), { addSuffix: true });
                  
                  return (
                    <tr 
                      key={post.id} 
                      className={`border-t border-border hover:bg-muted/50 ${isSelected ? 'bg-muted/30' : ''}`}
                    >
                      <td className="p-4">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => togglePostSelection(post.id)}
                          aria-label={`Select ${post.headline}`}
                        />
                      </td>
                      <td className="p-4">
                        <div className="max-w-md truncate font-medium">{post.headline}</div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm">
                          {post.client?.full_name || post.client?.email || 'Unknown'}
                        </div>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {format(parseISO(post.created_at), 'MMM d, yyyy')}
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {postAge}
                      </td>
                      <td className="p-4">
                        {post.wordpress_post_id ? (
                          <Badge className="bg-green-500 hover:bg-green-600">Published</Badge>
                        ) : (
                          <Badge variant="secondary">Not Published</Badge>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPreviewPostId(post.id)}
                            title="Preview post"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedPost(post);
                              setLinkDialogOpen(true);
                            }}
                            title="Link to assignment"
                          >
                            <Link2 className="mr-1 h-4 w-4" />
                            Link
                          </Button>
                          {post.wordpress_post_id === null && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleTriggerWordPress(post)}
                              disabled={publishingPostId === post.id}
                              title="Publish to WordPress"
                            >
                              {publishingPostId === post.id ? (
                                <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
                              ) : (
                                <Send className="mr-1 h-4 w-4" />
                              )}
                              Publish
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedPostIds.size} post{selectedPostIds.size !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. These posts will be permanently deleted from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showArchiveConfirm} onOpenChange={setShowArchiveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {selectedPostIds.size} post{selectedPostIds.size !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              These posts will be archived and hidden from this view. They can be recovered later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isArchiving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkArchive}
              disabled={isArchiving}
            >
              {isArchiving ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Archiving...
                </>
              ) : (
                <>
                  <Archive className="mr-2 h-4 w-4" />
                  Archive
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LinkOrphanedPostDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        post={selectedPost}
        onSuccess={handleLinkSuccess}
      />

      <SubmittedPostPreview
        open={!!previewPostId}
        onOpenChange={(open) => !open && setPreviewPostId(null)}
        postId={previewPostId || ''}
      />
    </div>
  );
}
