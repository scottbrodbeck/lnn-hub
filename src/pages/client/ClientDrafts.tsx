import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { FileText, Pencil, Trash2, Calendar, Clock, CalendarClock, FileEdit, CheckCircle2, XCircle, AlertCircle, Eye, Copy } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { SubmittedPostPreview } from '@/components/SubmittedPostPreview';

interface Draft {
  id: string;
  headline: string;
  content: string;
  updated_at: string;
  author_name: string | null;
  logo_url: string | null;
  gallery_images: any;
  youtube_url: string | null;
  assignment_ids: string[] | null;
  status: string;
}

interface EditRequest {
  id: string;
  request_type: string;
  status: string;
  requested_at: string;
  reviewed_at: string | null;
  review_notes: string | null;
  old_headline: string | null;
  new_headline: string | null;
  old_due_date: string | null;
  new_due_date: string | null;
  post_assignments?: {
    assignment_name: string;
    site: {
      name: string;
    };
  } | null;
}

export default function ClientDrafts() {
  const { user, activeOrganizationId } = useAuth();
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [submittedPosts, setSubmittedPosts] = useState<Draft[]>([]);
  const [editRequests, setEditRequests] = useState<EditRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewPostId, setPreviewPostId] = useState<string | null>(null);

  useEffect(() => {
    if (user && activeOrganizationId) {
      fetchPosts();
      fetchEditRequests();
    }
  }, [user, activeOrganizationId]);

  const fetchPosts = async () => {
    try {
      // Fetch drafts (scoped to active organization)
      const { data: draftsData, error: draftsError } = await supabase
        .from('posts')
        .select('*')
        .eq('client_id', user?.id)
        .eq('organization_id', activeOrganizationId)
        .eq('status', 'draft')
        .order('updated_at', { ascending: false });

      if (draftsError) throw draftsError;
      setDrafts(draftsData || []);

      // Fetch submitted posts (published or pending_edit_review)
      const { data: submittedData, error: submittedError } = await supabase
        .from('posts')
        .select('*')
        .eq('client_id', user?.id)
        .eq('organization_id', activeOrganizationId)
        .in('status', ['published', 'pending_edit_review'])
        .order('updated_at', { ascending: false });

      if (submittedError) throw submittedError;
      setSubmittedPosts(submittedData || []);
    } catch (error: any) {
      toast.error('Failed to load posts: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchEditRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('post_edit_requests')
        .select(`
          id,
          request_type,
          status,
          requested_at,
          reviewed_at,
          review_notes,
          old_headline,
          new_headline,
          old_due_date,
          new_due_date,
          post_assignments!inner(assignment_name, organization_id, site:sites(name))
        `)
        .eq('requested_by', user?.id)
        .eq('post_assignments.organization_id', activeOrganizationId)
        .order('requested_at', { ascending: false });

      if (error) throw error;
      setEditRequests((data || []) as EditRequest[]);
    } catch (error: any) {
      console.error('Failed to load edit requests:', error.message);
    }
  };

  const handleEdit = (draftId: string) => {
    navigate(`/client/submit?draft=${draftId}`);
  };

  const handleEditSubmitted = async (postId: string) => {
    navigate(`/client/edit?id=${postId}&from=drafts`);
  };

  const handleDelete = async (draftId: string) => {
    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', draftId)
        .eq('client_id', user?.id);

      if (error) throw error;

      toast.success('Draft deleted successfully');
      setDrafts(drafts.filter(d => d.id !== draftId));
    } catch (error: any) {
      toast.error('Failed to delete draft: ' + error.message);
    }
  };

  const getPreviewText = (content: string) => {
    const plainText = content.replace(/<[^>]*>/g, '');
    return plainText.length > 150 
      ? plainText.substring(0, 150) + '...' 
      : plainText;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getFeaturedImageUrl = (post: Draft): string | null => {
    if (post.gallery_images && Array.isArray(post.gallery_images)) {
      const featuredImage = post.gallery_images.find((img: any) => img.isFeatured);
      if (featuredImage) {
        return featuredImage.url;
      }
    }
    return null;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Pending
          </Badge>
        );
      case 'approved':
        return (
          <Badge variant="default" className="flex items-center gap-1 bg-green-600">
            <CheckCircle2 className="h-3 w-3" />
            Approved
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <XCircle className="h-3 w-3" />
            Not Approved
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getRequestTypeBadge = (type: string) => {
    switch (type) {
      case 'date_change':
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300">
            <CalendarClock className="h-3 w-3 mr-1" />
            Date Change
          </Badge>
        );
      case 'author_bio_default':
        return (
          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300">
            Author Bio
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300">
            <FileEdit className="h-3 w-3 mr-1" />
            Edit
          </Badge>
        );
    }
  };

  const pendingRequests = editRequests.filter(r => r.status === 'pending');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading drafts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">Drafts & Submissions</h1>
        <p className="text-muted-foreground mt-2">
          Manage your saved drafts, view previously submitted content, and track your requests
        </p>
      </div>

      <Tabs defaultValue="drafts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="drafts">
            Drafts ({drafts.length})
          </TabsTrigger>
          <TabsTrigger value="submitted">
            My Submissions ({submittedPosts.length})
          </TabsTrigger>
          <TabsTrigger value="requests" className="relative">
            My Requests ({editRequests.length})
            {pendingRequests.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-xs font-medium rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                {pendingRequests.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="drafts">
          {drafts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">No drafts yet</h3>
                <p className="text-muted-foreground mb-4">
                  Save posts as drafts to continue working on them later
                </p>
                <Button onClick={() => navigate('/client/submit')}>
                  Create New Post
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {drafts.map((draft) => {
                const featuredImageUrl = getFeaturedImageUrl(draft);
                
                return (
                  <Card key={draft.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4 flex-1">
                          {featuredImageUrl && (
                            <img 
                              src={featuredImageUrl} 
                              alt="Featured" 
                              className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                            />
                          )}
                          <div className="flex-1">
                            <CardTitle className="text-xl mb-2">{draft.headline}</CardTitle>
                            <CardDescription className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              Last edited: {formatDate(draft.updated_at)}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(draft.id)}
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Draft</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete this draft? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(draft.id)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">
                        {getPreviewText(draft.content)}
                      </p>
                      {draft.author_name && (
                        <p className="text-sm text-muted-foreground mt-2">
                          By {draft.author_name}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="submitted">
          {submittedPosts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">No submitted posts yet</h3>
                <p className="text-muted-foreground mb-4">
                  Posts you submit will appear here while they await review and publishing.
                </p>
                <Button onClick={() => navigate('/client/submit')}>
                  Submit a post
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {submittedPosts.map((post) => {
                const featuredImageUrl = getFeaturedImageUrl(post);
                
                return (
                  <Card key={post.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4 flex-1">
                          {featuredImageUrl && (
                            <img 
                              src={featuredImageUrl} 
                              alt="Featured" 
                              className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                            />
                          )}
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <CardTitle className="text-xl">{post.headline}</CardTitle>
                              {post.status === 'pending_edit_review' && (
                                <Badge variant="secondary">Edit Pending Review</Badge>
                              )}
                            </div>
                            <CardDescription className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              Last updated: {formatDate(post.updated_at)}
                            </CardDescription>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPreviewPostId(post.id)}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditSubmitted(post.id)}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/client/submit?cloneFrom=${post.id}`)}
                          title="Reuse this content for another site"
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Clone
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">
                        {getPreviewText(post.content)}
                      </p>
                      {post.author_name && (
                        <p className="text-sm text-muted-foreground mt-2">
                          By {post.author_name}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="requests">
          {editRequests.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">No requests yet</h3>
                <p className="text-muted-foreground text-center max-w-md">
                  When you request changes to published posts or date changes for assignments, they'll appear here so you can track their status.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {editRequests.map((request) => (
                <Card key={request.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {getRequestTypeBadge(request.request_type)}
                          {request.post_assignments?.site?.name && (
                            <Badge variant="secondary" className="text-xs">
                              {request.post_assignments.site.name}
                            </Badge>
                          )}
                        </div>
                        <CardTitle className="text-lg">
                          {request.request_type === 'date_change' 
                            ? request.post_assignments?.assignment_name || 'Date Change Request'
                            : request.old_headline || request.new_headline || 'Edit Request'
                          }
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          Submitted: {format(new Date(request.requested_at), 'MMM d, yyyy h:mm a')}
                        </CardDescription>
                      </div>
                      {getStatusBadge(request.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Date Change Details */}
                    {request.request_type === 'date_change' && request.old_due_date && request.new_due_date && (
                      <div className="flex items-center gap-3 text-sm bg-muted p-3 rounded-md">
                        <span className="text-muted-foreground">Requested:</span>
                        <span className="line-through text-destructive">
                          {format(parseISO(request.old_due_date), 'MMM d, yyyy')}
                        </span>
                        <span>→</span>
                        <span className="font-medium text-green-600">
                          {format(parseISO(request.new_due_date), 'MMM d, yyyy')}
                        </span>
                      </div>
                    )}

                    {/* Review Info */}
                    {request.status !== 'pending' && (
                      <div className={`p-3 rounded-md ${
                        request.status === 'approved' 
                          ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800' 
                          : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800'
                      }`}>
                        {request.reviewed_at && (
                          <p className="text-sm text-muted-foreground mb-1">
                            {request.status === 'approved' ? 'Approved' : 'Reviewed'} on {format(new Date(request.reviewed_at), 'MMM d, yyyy h:mm a')}
                          </p>
                        )}
                        {request.review_notes && (
                          <p className="text-sm">
                            <span className="font-medium">Admin Notes:</span> {request.review_notes}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Pending Message */}
                    {request.status === 'pending' && (
                      <p className="text-sm text-muted-foreground">
                        Your request is being reviewed by our team. You'll receive an email when a decision is made.
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Submitted Post Preview */}
      <SubmittedPostPreview
        open={!!previewPostId}
        onOpenChange={(open) => !open && setPreviewPostId(null)}
        postId={previewPostId || ''}
      />
    </div>
  );
}