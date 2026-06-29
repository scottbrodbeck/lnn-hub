import { UsersListContent } from '@/components/admin/UsersListContent';

export default function AdminUserActivity() {
  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">Users</h1>
        <p className="text-muted-foreground mt-2">
          Manage user accounts
        </p>
      </div>

      <UsersListContent />
    </div>
  );
}
