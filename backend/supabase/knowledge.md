## Database Migrations and Schema Updates

### Applying Migrations

The project does not use a migrate script. Instead, migrations are typically applied manually by running the SQL directly against the database.

### Regenerating Types and Schema

To regenerate TypeScript types and database schema for the development environment, use the following command:

```
(cd backend/supabase && make regen-types-dev regen-schema-dev)
```

This command should be run after making changes to the database structure or when updating the development environment.
