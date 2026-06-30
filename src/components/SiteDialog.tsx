import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { normalizeUrl } from '@/lib/urlUtils';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { PlugZap, Eye, EyeOff } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const formSchema = z.object({
  name: z.string().min(1, 'Site name is required'),
  url: z.string().transform(normalizeUrl).pipe(z.string().url('Must be a valid URL').min(1, 'Site URL is required')),
  wordpress_username: z.string().optional(),
  wordpress_app_password: z.string().optional(),
  is_active: z.boolean().default(true),
  // Beehiiv config fields
  beehiiv_api_key: z.string().optional(),
  beehiiv_publication_id: z.string().optional(),
  beehiiv_segment_id: z.string().optional(),
  beehiiv_banner_image_url: z.string().optional(),
  // Mailchimp config fields
  mailchimp_api_key: z.string().optional(),
  mailchimp_audience_id: z.string().optional(),
  mailchimp_saved_segment_id: z.string().optional(),
  mailchimp_from_name: z.string().optional(),
  mailchimp_reply_to: z.string().optional(),
  mailchimp_template_id: z.string().optional(),
  mailchimp_banner_image_url: z.string().optional(),
  // Broadstreet display ads config fields
  broadstreet_enabled: z.boolean().default(false),
  broadstreet_access_token: z.string().optional(),
  broadstreet_network_id: z.string().optional(),
  broadstreet_billboard_zone_id: z.string().optional(),
  broadstreet_skyscraper_zone_id: z.string().optional(),
  broadstreet_skyscraper_a_zone_id: z.string().optional(),
  default_wordpress_author_id: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface SiteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editingSite?: any;
}

export function SiteDialog({ open, onOpenChange, onSuccess, editingSite }: SiteDialogProps) {
  const [loading, setLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [showBeehiivApiKey, setShowBeehiivApiKey] = useState(false);
  const [hasExistingBeehiivKey, setHasExistingBeehiivKey] = useState(false);
  const [beehiivSectionOpen, setBeehiivSectionOpen] = useState(false);
  const [showMailchimpApiKey, setShowMailchimpApiKey] = useState(false);
  const [hasExistingMailchimpKey, setHasExistingMailchimpKey] = useState(false);
  const [mailchimpSectionOpen, setMailchimpSectionOpen] = useState(false);
  const [verifyingMailchimp, setVerifyingMailchimp] = useState(false);
  const [broadstreetSectionOpen, setBroadstreetSectionOpen] = useState(false);
  const [showBroadstreetToken, setShowBroadstreetToken] = useState(false);
  const [hasExistingBroadstreetToken, setHasExistingBroadstreetToken] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      url: '',
      wordpress_username: '',
      wordpress_app_password: '',
      is_active: true,
      beehiiv_api_key: '',
      beehiiv_publication_id: '',
      beehiiv_segment_id: '',
      beehiiv_banner_image_url: '',
      mailchimp_api_key: '',
      mailchimp_audience_id: '',
      mailchimp_saved_segment_id: '',
      mailchimp_from_name: '',
      mailchimp_reply_to: '',
      mailchimp_template_id: '',
      mailchimp_banner_image_url: '',
      broadstreet_enabled: false,
      broadstreet_access_token: '',
      broadstreet_network_id: '',
      broadstreet_billboard_zone_id: '',
      broadstreet_skyscraper_zone_id: '',
      broadstreet_skyscraper_a_zone_id: '',
      default_wordpress_author_id: '',
    },
  });

  useEffect(() => {
    if (open) {
      if (editingSite) {
        // Parse Beehiiv config from JSONB
        const beehiivConfig = editingSite.beehiiv_config || {};
        const hasApiKey = !!beehiivConfig.api_key;
        setHasExistingBeehiivKey(hasApiKey);
        setShowBeehiivApiKey(false);
        
        // Open Beehiiv section if there's existing config
        setBeehiivSectionOpen(hasApiKey || !!beehiivConfig.publication_id);

        // Parse Mailchimp config from JSONB
        const mailchimpConfig = editingSite.mailchimp_config || {};
        const hasMailchimpKey = !!mailchimpConfig.api_key;
        setHasExistingMailchimpKey(hasMailchimpKey);
        setShowMailchimpApiKey(false);
        setMailchimpSectionOpen(hasMailchimpKey || !!mailchimpConfig.audience_id);

        // Parse Broadstreet config from JSONB
        const broadstreetConfig = editingSite.broadstreet_config || {};
        const hasBroadstreetToken = !!broadstreetConfig.access_token;
        setHasExistingBroadstreetToken(hasBroadstreetToken);
        setShowBroadstreetToken(false);
        setBroadstreetSectionOpen(broadstreetConfig.enabled || false);
        
        form.reset({
          name: editingSite.name,
          url: editingSite.url,
          wordpress_username: editingSite.wordpress_username || '',
          wordpress_app_password: '', // Don't populate password for security
          is_active: editingSite.is_active,
          beehiiv_api_key: '', // Don't populate API key for security
          beehiiv_publication_id: beehiivConfig.publication_id || '',
          beehiiv_segment_id: beehiivConfig.segment_id || '',
          beehiiv_banner_image_url: beehiivConfig.banner_image_url || '',
          mailchimp_api_key: '', // Don't populate API key for security
          mailchimp_audience_id: mailchimpConfig.audience_id || '',
          mailchimp_saved_segment_id: mailchimpConfig.saved_segment_id?.toString() || '',
          mailchimp_from_name: mailchimpConfig.from_name || '',
          mailchimp_reply_to: mailchimpConfig.reply_to || '',
          mailchimp_template_id: mailchimpConfig.template_id?.toString() || '',
          mailchimp_banner_image_url: mailchimpConfig.banner_image_url || '',
          broadstreet_enabled: broadstreetConfig.enabled || false,
          broadstreet_access_token: '', // Don't populate token for security
          broadstreet_network_id: broadstreetConfig.network_id || '',
          broadstreet_billboard_zone_id: broadstreetConfig.billboard_zone_id?.toString() || '',
          broadstreet_skyscraper_zone_id: broadstreetConfig.skyscraper_zone_id?.toString() || '',
          broadstreet_skyscraper_a_zone_id: broadstreetConfig.skyscraper_a_zone_id?.toString() || '',
          default_wordpress_author_id: editingSite.default_wordpress_author_id?.toString() || '',
        });
      } else {
        setHasExistingBeehiivKey(false);
        setShowBeehiivApiKey(false);
        setBeehiivSectionOpen(false);
        setHasExistingMailchimpKey(false);
        setShowMailchimpApiKey(false);
        setMailchimpSectionOpen(false);
        setBroadstreetSectionOpen(false);
        setHasExistingBroadstreetToken(false);
        setShowBroadstreetToken(false);
        form.reset({
          name: '',
          url: '',
          wordpress_username: '',
          wordpress_app_password: '',
          is_active: true,
          beehiiv_api_key: '',
          beehiiv_publication_id: '',
          beehiiv_segment_id: '',
          beehiiv_banner_image_url: '',
          mailchimp_api_key: '',
          mailchimp_audience_id: '',
          mailchimp_saved_segment_id: '',
          mailchimp_from_name: '',
          mailchimp_reply_to: '',
          mailchimp_template_id: '',
          mailchimp_banner_image_url: '',
          broadstreet_enabled: false,
          broadstreet_access_token: '',
          broadstreet_network_id: '',
          broadstreet_billboard_zone_id: '',
          broadstreet_skyscraper_zone_id: '',
          broadstreet_skyscraper_a_zone_id: '',
          default_wordpress_author_id: '',
        });
      }
    }
  }, [open, editingSite]);

  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const url = form.getValues('url');
      const username = form.getValues('wordpress_username');
      const formPassword = form.getValues('wordpress_app_password');

      // For existing sites, we can use site_id to let the edge function fetch credentials from DB
      // Otherwise, use form values
      if (editingSite && !formPassword) {
        // Use saved credentials from database via site_id
        if (!url || !username) {
          toast.error('Please fill in URL and username');
          return;
        }

        const { data, error } = await supabase.functions.invoke('publish-to-wordpress', {
          body: {
            mode: 'test',
            site_id: editingSite.id,
          },
        });

        if (error) throw error;

        if (data.success) {
          toast.success(`Connection successful! Test post created: ${data.wordpress_post_title}`, {
            description: 'You can view and delete this test post in your WordPress admin.',
            duration: 5000,
          });
        } else {
          toast.error(`Connection failed: ${data.error}`);
        }
      } else {
        // Use form credentials (new site or updating password)
        if (!url || !username || !formPassword) {
          toast.error('Please fill in all WordPress credentials');
          return;
        }

        const { data, error } = await supabase.functions.invoke('publish-to-wordpress', {
          body: {
            mode: 'test',
            credentials: {
              url,
              username,
              app_password: formPassword,
            },
          },
        });

        if (error) throw error;

        if (data.success) {
          toast.success(`Connection successful! Test post created: ${data.wordpress_post_title}`, {
            description: 'You can view and delete this test post in your WordPress admin.',
            duration: 5000,
          });
        } else {
          toast.error(`Connection failed: ${data.error}`);
        }
      }
    } catch (error) {
      console.error('Error testing connection:', error);
      toast.error('Failed to test connection. Please check your credentials and try again.');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleVerifyMailchimp = async () => {
    setVerifyingMailchimp(true);
    try {
      const formKey = form.getValues('mailchimp_api_key');
      const formAudienceId = form.getValues('mailchimp_audience_id');

      if (!formKey && !hasExistingMailchimpKey) {
        toast.error('Please enter a Mailchimp API key first');
        return;
      }

      // Use form credentials when provided; otherwise the edge function falls
      // back to the saved site config (same pattern as the WordPress test)
      const { data, error } = await supabase.functions.invoke('create-mailchimp-campaign', {
        body: {
          mode: 'verify',
          ...(editingSite ? { siteId: editingSite.id } : {}),
          credentials: {
            ...(formKey ? { api_key: formKey } : {}),
            ...(formAudienceId ? { audience_id: formAudienceId } : {}),
          },
        },
      });

      if (error) throw error;

      if (data.success) {
        const audienceInfo = data.audience_name
          ? `Connected to audience "${data.audience_name}"${data.from_name ? ` — default sender: ${data.from_name} <${data.from_email}>` : ''}`
          : 'API key is valid. Add an Audience ID to verify the audience.';
        toast.success('Mailchimp connection verified!', {
          description: audienceInfo,
          duration: 6000,
        });
      } else {
        toast.error(`Verification failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Error verifying Mailchimp:', error);
      toast.error('Failed to verify Mailchimp. Please check your credentials and try again.');
    } finally {
      setVerifyingMailchimp(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      const siteData: any = {
        name: values.name,
        url: values.url,
        wordpress_username: values.wordpress_username || null,
        is_active: values.is_active,
      };

      // Only update password if provided
      if (values.wordpress_app_password) {
        siteData.wordpress_app_password = values.wordpress_app_password;
      }

      // Default WordPress author ID
      siteData.default_wordpress_author_id = values.default_wordpress_author_id 
        ? parseInt(values.default_wordpress_author_id, 10) 
        : null;

      // Build Beehiiv config - merge with existing if editing
      if (editingSite) {
        const existingConfig = editingSite.beehiiv_config || {};
        const newConfig: any = { ...existingConfig };
        
        // Only update API key if a new one is provided
        if (values.beehiiv_api_key) {
          newConfig.api_key = values.beehiiv_api_key;
        }
        
        // Always update other fields (they're visible)
        if (values.beehiiv_publication_id !== undefined) {
          newConfig.publication_id = values.beehiiv_publication_id || null;
        }
        if (values.beehiiv_segment_id !== undefined) {
          newConfig.segment_id = values.beehiiv_segment_id || null;
        }
        if (values.beehiiv_banner_image_url !== undefined) {
          newConfig.banner_image_url = values.beehiiv_banner_image_url || null;
        }
        
        siteData.beehiiv_config = newConfig;
      } else {
        // New site - set all Beehiiv config
        siteData.beehiiv_config = {
          api_key: values.beehiiv_api_key || null,
          publication_id: values.beehiiv_publication_id || null,
          segment_id: values.beehiiv_segment_id || null,
          banner_image_url: values.beehiiv_banner_image_url || null,
        };
      }

      // Build Mailchimp config - merge with existing if editing
      if (editingSite) {
        const existingMailchimpConfig = editingSite.mailchimp_config || {};
        const newMailchimpConfig: any = { ...existingMailchimpConfig };

        // Only update API key if a new one is provided
        if (values.mailchimp_api_key) {
          newMailchimpConfig.api_key = values.mailchimp_api_key;
        }

        // Always update other fields (they're visible)
        newMailchimpConfig.audience_id = values.mailchimp_audience_id || null;
        newMailchimpConfig.saved_segment_id = values.mailchimp_saved_segment_id
          ? parseInt(values.mailchimp_saved_segment_id, 10)
          : null;
        newMailchimpConfig.from_name = values.mailchimp_from_name || null;
        newMailchimpConfig.reply_to = values.mailchimp_reply_to || null;
        newMailchimpConfig.banner_image_url = values.mailchimp_banner_image_url || null;

        // A blank template field must not wipe an auto-created template_id
        if (values.mailchimp_template_id) {
          newMailchimpConfig.template_id = parseInt(values.mailchimp_template_id, 10);
        }

        siteData.mailchimp_config = newMailchimpConfig;
      } else {
        // New site - set all Mailchimp config
        siteData.mailchimp_config = {
          api_key: values.mailchimp_api_key || null,
          audience_id: values.mailchimp_audience_id || null,
          saved_segment_id: values.mailchimp_saved_segment_id
            ? parseInt(values.mailchimp_saved_segment_id, 10)
            : null,
          from_name: values.mailchimp_from_name || null,
          reply_to: values.mailchimp_reply_to || null,
          template_id: values.mailchimp_template_id
            ? parseInt(values.mailchimp_template_id, 10)
            : null,
          banner_image_url: values.mailchimp_banner_image_url || null,
        };
      }

      // Build Broadstreet config - merge with existing if editing
      if (editingSite) {
        const existingBroadstreetConfig = editingSite.broadstreet_config || {};
        const newBroadstreetConfig: any = { ...existingBroadstreetConfig };
        
        newBroadstreetConfig.enabled = values.broadstreet_enabled || false;
        
        // Only update access_token if a new one is provided
        if (values.broadstreet_access_token) {
          newBroadstreetConfig.access_token = values.broadstreet_access_token;
        }
        
        // Always update network_id and zone IDs (they're visible)
        newBroadstreetConfig.network_id = values.broadstreet_network_id || null;
        newBroadstreetConfig.billboard_zone_id = values.broadstreet_billboard_zone_id ? parseInt(values.broadstreet_billboard_zone_id, 10) : null;
        newBroadstreetConfig.skyscraper_zone_id = values.broadstreet_skyscraper_zone_id ? parseInt(values.broadstreet_skyscraper_zone_id, 10) : null;
        newBroadstreetConfig.skyscraper_a_zone_id = values.broadstreet_skyscraper_a_zone_id ? parseInt(values.broadstreet_skyscraper_a_zone_id, 10) : null;
        
        siteData.broadstreet_config = newBroadstreetConfig;
      } else {
        // New site - set all Broadstreet config
        siteData.broadstreet_config = {
          enabled: values.broadstreet_enabled || false,
          access_token: values.broadstreet_access_token || null,
          network_id: values.broadstreet_network_id || null,
          billboard_zone_id: values.broadstreet_billboard_zone_id ? parseInt(values.broadstreet_billboard_zone_id, 10) : null,
          skyscraper_zone_id: values.broadstreet_skyscraper_zone_id ? parseInt(values.broadstreet_skyscraper_zone_id, 10) : null,
          skyscraper_a_zone_id: values.broadstreet_skyscraper_a_zone_id ? parseInt(values.broadstreet_skyscraper_a_zone_id, 10) : null,
        };
      }

      if (editingSite) {
        const { error } = await supabase
          .from('sites')
          .update(siteData)
          .eq('id', editingSite.id);

        if (error) throw error;
        toast.success('Site updated successfully');
      } else {
        const { error } = await supabase
          .from('sites')
          .insert(siteData);

        if (error) throw error;
        toast.success('Site created successfully');
      }

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving site:', error);
      toast.error('Failed to save site');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{editingSite ? 'Edit Site' : 'Add New Site'}</DialogTitle>
          <DialogDescription>
            {editingSite 
              ? 'Update WordPress site details and credentials' 
              : 'Add a new WordPress site for post publishing'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-scroll -mx-6 px-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Site Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Tech Blog" {...field} />
                  </FormControl>
                  <FormDescription>
                    A friendly name to identify this site
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Site URL</FormLabel>
                  <FormControl>
                    <Input placeholder="https://example.com" {...field} />
                  </FormControl>
                  <FormDescription>
                    The full URL of your WordPress site
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">WordPress Credentials</h3>
                <div className="flex gap-2">
                  <Button 
                    type="button"
                    variant="outline" 
                    size="sm"
                    onClick={handleTestConnection}
                    disabled={testingConnection || !form.watch('url') || !form.watch('wordpress_username') || (!editingSite && !form.watch('wordpress_app_password'))}
                  >
                    <PlugZap className="mr-2 h-4 w-4" />
                    {testingConnection ? 'Testing...' : 'Test Connection'}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Required for automatic post publishing. Generate an application password in WordPress under Users → Profile → Application Passwords.
              </p>

              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="wordpress_username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>WordPress Username</FormLabel>
                      <FormControl>
                        <Input placeholder="admin" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="wordpress_app_password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        WordPress Application Password
                        {editingSite && ' (leave empty to keep existing)'}
                      </FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          placeholder="xxxx xxxx xxxx xxxx xxxx xxxx" 
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>
                        Not your account password - generate this in WordPress
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="default_wordpress_author_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Author ID</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., 123" {...field} />
                      </FormControl>
                      <FormDescription>
                        WordPress author ID to use when a post has no custom author. Find this in WP under PublishPress Authors.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Beehiiv Configuration Section */}
            <div className="border-t border-border pt-4">
              <Collapsible open={beehiivSectionOpen} onOpenChange={setBeehiivSectionOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-0 h-auto font-semibold text-sm hover:bg-transparent">
                    <span>Beehiiv Email Configuration</span>
                    <span className="text-muted-foreground text-xs">
                      {beehiivSectionOpen ? '▼' : '▶'}
                    </span>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4 space-y-4">
                  <p className="text-xs text-muted-foreground mb-4">
                    Configure Beehiiv integration for email blast publishing. The API key is stored securely and not visible to other admins.
                  </p>

                  <FormField
                    control={form.control}
                    name="beehiiv_api_key"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Beehiiv API Key
                          {hasExistingBeehiivKey && ' (leave empty to keep existing)'}
                        </FormLabel>
                        <div className="relative">
                          <FormControl>
                            <Input 
                              type={showBeehiivApiKey ? 'text' : 'password'}
                              placeholder={hasExistingBeehiivKey ? '••••••••••••••••' : 'Enter API key'}
                              {...field} 
                            />
                          </FormControl>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                            onClick={() => setShowBeehiivApiKey(!showBeehiivApiKey)}
                          >
                            {showBeehiivApiKey ? (
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <Eye className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
                        <FormDescription>
                          Get this from Beehiiv Settings → Integrations → API
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="beehiiv_publication_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Publication ID</FormLabel>
                        <FormControl>
                          <Input placeholder="pub_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" {...field} />
                        </FormControl>
                        <FormDescription>
                          Found in Beehiiv Settings → General
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="beehiiv_segment_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Segment ID (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="seg_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" {...field} />
                        </FormControl>
                        <FormDescription>
                          Target a specific subscriber segment for email blasts
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="beehiiv_banner_image_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Default Banner Image URL (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="https://..." {...field} />
                        </FormControl>
                        <FormDescription>
                          Default header banner for email blasts
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CollapsibleContent>
              </Collapsible>
            </div>

            {/* Mailchimp Configuration Section */}
            <div className="border-t border-border pt-4">
              <Collapsible open={mailchimpSectionOpen} onOpenChange={setMailchimpSectionOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-0 h-auto font-semibold text-sm hover:bg-transparent">
                    <span>Mailchimp Email Configuration</span>
                    <span className="text-muted-foreground text-xs">
                      {mailchimpSectionOpen ? '▼' : '▶'}
                    </span>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Configure Mailchimp integration for email blast publishing. The API key is stored securely and not visible to other admins.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleVerifyMailchimp}
                      disabled={verifyingMailchimp || (!hasExistingMailchimpKey && !form.watch('mailchimp_api_key'))}
                    >
                      <PlugZap className="mr-2 h-4 w-4" />
                      {verifyingMailchimp ? 'Verifying...' : 'Verify'}
                    </Button>
                  </div>

                  {(hasExistingBeehiivKey || !!form.watch('beehiiv_api_key')) &&
                    !!form.watch('beehiiv_publication_id') &&
                    (hasExistingMailchimpKey || !!form.watch('mailchimp_api_key')) &&
                    !!form.watch('mailchimp_audience_id') && (
                    <p className="text-xs text-amber-600 dark:text-amber-500 border border-amber-300 dark:border-amber-700 rounded-md p-2">
                      Both Beehiiv and Mailchimp are configured for this site. Beehiiv takes precedence — clear its config to use Mailchimp for email blasts.
                    </p>
                  )}

                  <FormField
                    control={form.control}
                    name="mailchimp_api_key"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Mailchimp API Key
                          {hasExistingMailchimpKey && ' (leave empty to keep existing)'}
                        </FormLabel>
                        <div className="relative">
                          <FormControl>
                            <Input
                              type={showMailchimpApiKey ? 'text' : 'password'}
                              placeholder={hasExistingMailchimpKey ? '••••••••••••••••' : 'Enter API key (ends in -us21 etc.)'}
                              {...field}
                            />
                          </FormControl>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                            onClick={() => setShowMailchimpApiKey(!showMailchimpApiKey)}
                          >
                            {showMailchimpApiKey ? (
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <Eye className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
                        <FormDescription>
                          Get this from Mailchimp Account → Extras → API Keys
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="mailchimp_audience_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Audience ID</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., a1b2c3d4e5" {...field} />
                        </FormControl>
                        <FormDescription>
                          Found in Mailchimp under Audience → Settings → Audience name and defaults
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="mailchimp_saved_segment_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Saved Segment ID (Optional)</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="e.g., 12345" {...field} />
                        </FormControl>
                        <FormDescription>
                          Target a specific saved segment for email blasts (numeric ID)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="mailchimp_from_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>From Name (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., ARLnow" {...field} />
                        </FormControl>
                        <FormDescription>
                          Defaults to the audience's campaign defaults when blank
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="mailchimp_reply_to"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Reply-To Email (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., hello@example.com" {...field} />
                        </FormControl>
                        <FormDescription>
                          Must be on a verified sending domain. Defaults to the audience's campaign defaults when blank.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="mailchimp_template_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Template ID (Optional)</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="Auto-created on first blast" {...field} />
                        </FormControl>
                        <FormDescription>
                          Leave blank to auto-create a standard blast template on first use. To use a custom classic template instead, its editable regions must be named: banner_image, main_image, headline, body, cta_button, secondary_image, disclaimer.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="mailchimp_banner_image_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Default Banner Image URL (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="https://..." {...field} />
                        </FormControl>
                        <FormDescription>
                          Default header banner for email blasts
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CollapsibleContent>
              </Collapsible>
            </div>

            {/* Broadstreet Display Ads Configuration Section */}
            <div className="border-t border-border pt-4">
              <Collapsible open={broadstreetSectionOpen} onOpenChange={setBroadstreetSectionOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-0 h-auto font-semibold text-sm hover:bg-transparent">
                    <span>Broadstreet Display Ads</span>
                    <span className="text-muted-foreground text-xs">
                      {broadstreetSectionOpen ? '▼' : '▶'}
                    </span>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4 space-y-4">
                  <p className="text-xs text-muted-foreground mb-4">
                    Configure Broadstreet display ad zones for this site. Leave credentials blank to use global defaults.
                  </p>

                  <FormField
                    control={form.control}
                    name="broadstreet_enabled"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-3">
                        <div className="space-y-0.5">
                          <FormLabel className="text-sm">Enable Display Ads</FormLabel>
                          <FormDescription className="text-xs">
                            Allow clients to manage display ads for this site
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <div className="border border-border rounded-lg p-4 space-y-4">
                    <p className="text-xs font-medium text-muted-foreground">API Credentials (leave blank to use global defaults)</p>
                    
                    <FormField
                      control={form.control}
                      name="broadstreet_access_token"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Access Token
                            {hasExistingBroadstreetToken && ' (leave empty to keep existing)'}
                          </FormLabel>
                          <div className="relative">
                            <FormControl>
                              <Input 
                                type={showBroadstreetToken ? 'text' : 'password'}
                                placeholder={hasExistingBroadstreetToken ? '••••••••••••' : 'Enter access token'}
                                {...field} 
                              />
                            </FormControl>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                              onClick={() => setShowBroadstreetToken(!showBroadstreetToken)}
                            >
                              {showBroadstreetToken ? (
                                <EyeOff className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <Eye className="h-4 w-4 text-muted-foreground" />
                              )}
                            </Button>
                          </div>
                          <FormDescription>
                            Override global access token for this site
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="broadstreet_network_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Network ID</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g., 12345" 
                              {...field} 
                            />
                          </FormControl>
                          <FormDescription>
                            Override global network ID for this site
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="broadstreet_billboard_zone_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Billboard Zone ID (600x300)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="e.g., 12345" 
                            {...field} 
                          />
                        </FormControl>
                        <FormDescription>
                          Zone ID for 600x300 billboard ads
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="broadstreet_skyscraper_zone_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Primary Skyscraper Zone ID (300x600)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="e.g., 12346" 
                            {...field} 
                          />
                        </FormControl>
                        <FormDescription>
                          Primary zone ID for 300x600 skyscraper ads
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="broadstreet_skyscraper_a_zone_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Secondary Skyscraper Zone ID (300x600)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="e.g., 12347" 
                            {...field} 
                          />
                        </FormControl>
                        <FormDescription>
                          Secondary zone ID for 300x600 skyscraper ads
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CollapsibleContent>
              </Collapsible>
            </div>
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Active Site</FormLabel>
                    <FormDescription>
                      Inactive sites won't appear in assignment options
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            </form>
          </Form>
        </div>

        <DialogFooter className="pt-4 border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            type="button" 
            disabled={loading}
            onClick={form.handleSubmit(onSubmit)}
          >
            {loading ? 'Saving...' : editingSite ? 'Update Site' : 'Add Site'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
