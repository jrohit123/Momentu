# Task Dependencies Feature - Test Checklist

## ✅ Implementation Status
- [x] Database migration created and applied
- [x] Supabase types updated
- [x] UI for dependency selection in TaskCreateDialog
- [x] Dependency validation (circular dependency prevention)
- [x] Display dependencies in TaskList
- [x] Block task completion if dependencies not met

## 🧪 Manual Testing Steps

### 1. Create Task with Dependencies
- [ ] Navigate to Dashboard → TASKS tab
- [ ] Click "Create Task"
- [ ] Fill in task details (name, description, etc.)
- [ ] Scroll to "Dependencies" section
- [ ] Click "Select Dependencies" button
- [ ] Search for existing tasks (autocomplete should work)
- [ ] Select one or more tasks as dependencies
- [ ] Verify selected dependencies appear as badges
- [ ] Remove a dependency by clicking the X on the badge
- [ ] Save the task
- [ ] Verify task is created successfully

### 2. Edit Task Dependencies
- [ ] Open an existing task for editing
- [ ] Verify existing dependencies are loaded and displayed
- [ ] Add a new dependency
- [ ] Remove an existing dependency
- [ ] Save changes
- [ ] Verify dependencies are updated correctly

### 3. Display Dependencies in Task List
- [ ] Navigate to Dashboard → TASKS tab
- [ ] Verify tasks with dependencies show:
  - Link2 icon
  - "Depends on:" label
  - Badges for each dependent task
- [ ] Verify tasks without dependencies don't show dependency section

### 4. Circular Dependency Prevention
- [ ] Create Task A
- [ ] Create Task B
- [ ] Set Task A to depend on Task B
- [ ] Try to set Task B to depend on Task A
- [ ] Verify error message: "Circular dependency detected"
- [ ] Verify the dependency is not saved

### 5. Block Task Completion (Dependencies Not Met)
- [ ] Create Task A (with no dependencies)
- [ ] Create Task B (depends on Task A)
- [ ] Assign both tasks to yourself
- [ ] Try to complete Task B before Task A
- [ ] Verify error message indicating Task A must be completed first
- [ ] Complete Task A
- [ ] Try to complete Task B again
- [ ] Verify Task B can now be completed

### 6. Partial Completion Handling
- [ ] Create Task A with benchmark (e.g., 10 units)
- [ ] Create Task B (depends on Task A)
- [ ] Assign both tasks to yourself
- [ ] Complete Task A partially (e.g., 5/10 units = "partial" status)
- [ ] Try to complete Task B
- [ ] Verify Task B can be completed (partial counts as progress)

### 7. Multiple Dependencies
- [ ] Create Task A
- [ ] Create Task B
- [ ] Create Task C (depends on both A and B)
- [ ] Assign all tasks to yourself
- [ ] Try to complete Task C (should fail)
- [ ] Complete Task A (Task C should still be blocked)
- [ ] Complete Task B (Task C should now be completable)
- [ ] Complete Task C (should succeed)

### 8. Dependency Across Different Users
- [ ] Create Task A, assign to User 1
- [ ] Create Task B, assign to User 2 (depends on Task A)
- [ ] As User 2, try to complete Task B
- [ ] Verify behavior (should check if User 2 has assignment for Task A, or if Task A is completed by User 1)

### 9. Delete Task with Dependencies
- [ ] Create Task A
- [ ] Create Task B (depends on Task A)
- [ ] Delete Task A
- [ ] Verify Task B's dependencies are handled (should be removed via CASCADE)

### 10. UI/UX Validation
- [ ] Verify dependency selection popover is responsive
- [ ] Verify search works with minimum 3 characters
- [ ] Verify loading states are shown
- [ ] Verify error messages are user-friendly
- [ ] Verify mobile responsiveness

## 🔍 Code Verification

### Database Schema
- ✅ `task_dependencies` table exists
- ✅ Foreign keys to `tasks` table
- ✅ Unique constraint on (task_id, depends_on_task_id)
- ✅ No self-dependency constraint
- ✅ RLS policies enabled

### Functions & Triggers
- ✅ `check_circular_dependency` function exists
- ✅ `prevent_circular_dependency` trigger function exists
- ✅ Trigger applied to `task_dependencies` table

### TypeScript Types
- ✅ `task_dependencies` table in Supabase types
- ✅ Row, Insert, Update types defined
- ✅ Relationships defined correctly

### UI Components
- ✅ Dependency selection in TaskCreateDialog
- ✅ Dependency display in TaskList
- ✅ Error handling for circular dependencies
- ✅ Blocking logic in useDailyTasks

## 🐛 Known Issues
None currently identified.

## 📝 Notes
- Dependencies are checked per user assignment
- Partial completions count as progress for dependencies
- Dependencies are checked for the same scheduled date
- Circular dependencies are prevented at the database level

