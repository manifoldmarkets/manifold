# Comment Deletion Feature Implementation Summary

## Overview
Added a new "delete" option to the comments dropdown menu that allows admins/mods to completely hide comments from rendering, rather than just showing "comment hidden" like the existing hide functionality.

## Key Features
- **Admin/Mod Only**: Delete functionality is restricted to admins and moderators only (more restrictive than hide)
- **Complete Removal**: Deleted comments are completely filtered out and don't render at all
- **Preservation of Hide**: Existing hide functionality remains unchanged for less severe moderation
- **Protection**: Prevents deletion of admin/mod comments by other users

## Technical Implementation

### 1. Data Model Changes
**File**: `common/src/comment.ts`
- Added `deleted?: boolean` field to Comment type
- Added `deletedTime?: number` field for tracking deletion timestamp  
- Added `deleterId?: string` field for tracking who deleted the comment

### 2. API Schema Updates
**File**: `common/src/api/schema.ts`
- Modified `hide-comment` API to accept optional `action` parameter
- Action values: `'hide'` (default) or `'delete'`

### 3. Backend API Logic
**File**: `backend/api/src/hide-comment.ts`
- **Delete Action**: Only admins/mods can delete (not contract creators)
- **Hide Action**: Contract creators, admins, and mods can hide
- Added protection against deleting admin/mod comments
- Proper tracking events for both actions
- Updates appropriate database fields based on action type

### 4. Frontend Components

#### Comment Rendering
**Files**: `web/components/comments/comment.tsx`
- `FeedComment` and `ParentFeedComment` return `null` for deleted comments
- `HideableContent` component skips rendering deleted comments entirely

#### UI Controls
**File**: `web/components/comments/comment-header.tsx`
- Added delete option to dropdown menu (mods only)
- Uses TrashIcon with red color styling
- Calls hide-comment API with `action='delete'`
- Includes optimistic updates and error handling

### 5. Database Query Updates
**Files**: Multiple comment fetching functions updated
- `backend/shared/src/supabase/contract-comments.ts`
- `common/src/supabase/comments.ts`
- `web/lib/supabase/comments.ts`

**Query Modifications**: All comment queries now filter out deleted comments using conditions like:
```sql
.not('data->>deleted', 'eq', 'true')
-- or
(cc.data->>'deleted' is null or cc.data->>'deleted' = 'false')
```

**Affected Functions**:
- `getCommentsDirect`
- `getPostAndContractComments` 
- `getRecentTopLevelCommentsAndReplies`
- `getPinnedComments`
- `getCommentThread`
- `getAllCommentRows`
- `getCommentRows`
- `getNewCommentRows`
- `getRecentCommentsOnContracts`

## Permission Matrix

| Action | Contract Creator | Admin | Mod |
|--------|-----------------|-------|-----|
| Hide Comment | ✅ | ✅ | ✅ |
| Delete Comment | ❌ | ✅ | ✅ |
| Delete Admin/Mod Comment | ❌ | ❌ | ❌ |

## User Experience
- **Seamless Removal**: Deleted comments completely disappear from view
- **Optimistic Updates**: UI responds immediately with rollback on API failure
- **Clear Distinction**: Different visual treatment (TrashIcon) for delete vs hide actions
- **No Placeholder**: Unlike hidden comments, deleted comments show no trace

## Data Integrity
- Maintains audit trail with `deletedTime` and `deleterId` fields
- Comments remain in database for potential recovery/audit purposes
- Proper tracking events ensure moderation actions are logged
- Database-level filtering prevents accidental exposure of deleted content

## Benefits
1. **Stronger Moderation**: More severe action than hiding for problematic content
2. **Clean User Experience**: Complete removal vs. "comment hidden" placeholder
3. **Granular Control**: Different permission levels for hide vs delete
4. **Audit Trail**: Full tracking of deletion actions for accountability
5. **Performance**: Database-level filtering reduces unnecessary data processing