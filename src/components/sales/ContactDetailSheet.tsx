import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mail, Phone, Building, Pencil } from 'lucide-react';
import { ContactFormDialog } from './ContactFormDialog';
import { ActivityTimeline } from './ActivityTimeline';
import { type CrmContactWithOrg } from '@/hooks/useCrmContacts';
import { useCrmDeals } from '@/hooks/useCrmDeals';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  contact: CrmContactWithOrg | null;
}

export function ContactDetailSheet({ open, onOpenChange, contact }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const { data: deals = [] } = useCrmDeals({});

  if (!contact) return null;
  const name = `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || '(No name)';
  const contactDeals = deals.filter((d) => d.primary_contact_id === contact.id);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <SheetTitle className="text-2xl">{name}</SheetTitle>
              {contact.title && <p className="text-sm text-muted-foreground">{contact.title}</p>}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4 mr-1" /> Edit
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {contact.is_primary && <Badge>Primary</Badge>}
            {contact.organization_name && (
              <Badge variant="secondary">
                <Building className="h-3 w-3 mr-1" /> {contact.organization_name}
              </Badge>
            )}
          </div>
        </SheetHeader>

        <Tabs defaultValue="overview" className="mt-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="deals">Deals ({contactDeals.length})</TabsTrigger>
            <TabsTrigger value="activities">Activities</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            {contact.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a className="hover:underline" href={`mailto:${contact.email}`}>{contact.email}</a>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <a className="hover:underline" href={`tel:${contact.phone}`}>{contact.phone}</a>
              </div>
            )}
            {contact.notes && (
              <div>
                <p className="text-sm font-medium mb-1">Notes</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{contact.notes}</p>
              </div>
            )}
            {contact.owner_name && (
              <div className="text-sm">
                <span className="text-muted-foreground">Owner: </span>{contact.owner_name}
              </div>
            )}
          </TabsContent>

          <TabsContent value="deals" className="mt-4">
            {contactDeals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No deals.</p>
            ) : (
              <ul className="space-y-2">
                {contactDeals.map((d) => (
                  <li key={d.id} className="rounded-md border p-3 text-sm flex justify-between">
                    <span>{d.title}</span>
                    <span className="text-muted-foreground">{d.stage_name}</span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="activities" className="mt-4">
            <ActivityTimeline contactId={contact?.id} />
          </TabsContent>
        </Tabs>

        <ContactFormDialog open={editOpen} onOpenChange={setEditOpen} contact={contact} />
      </SheetContent>
    </Sheet>
  );
}
