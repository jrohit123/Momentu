# Excel Upload Feature - Testing Guide

## Quick Start

### 1. Access the Feature
1. Log in to the application
2. Navigate to **Dashboard → TASKS** tab
3. Click the **"Upload Excel"** button (next to "Create Task")
4. The Excel Upload Dialog will open

### 2. Download Template
1. In the Excel Upload Dialog, click **"Download Template"**
2. This will download `task_upload_template.xlsx` with example data
3. Open the file in Excel/LibreOffice/Google Sheets
4. Use it as a reference for the correct format

## Creating Test Files

### Basic Test File (Excel/CSV)

Create a file with these columns:

| Task Name | Description | Category | Benchmark | Recurrence Type | Recurrence Config | Assignees | Dependencies |
|-----------|-------------|----------|-----------|-----------------|-------------------|-----------|--------------|
| Test Task 1 | This is a test task | Development | 10 | weekly | {"days": [1, 3, 5]} | user@example.com | |
| Test Task 2 | Another test task | Testing | | daily | | | Test Task 1 |
| Test Task 3 | Simple task | | 5 | none | | | |

### Column Name Variations Supported

The parser accepts multiple column name formats:
- **Task Name**: `Task Name`, `task_name`, `Name`
- **Description**: `Description`, `description`
- **Category**: `Category`, `category`
- **Benchmark**: `Benchmark`, `benchmark`
- **Recurrence Type**: `Recurrence Type`, `recurrence_type`, `Recurrence`
- **Recurrence Config**: `Recurrence Config`, `recurrence_config`
- **Assignees**: `Assignees`, `assignees`, `Assigned To`
- **Dependencies**: `Dependencies`, `dependencies`, `Depends On`

## Test Scenarios

### Scenario 1: Basic Task Creation
**File**: Simple tasks with minimal data
```
Task Name: "Daily Standup"
Recurrence Type: "daily"
```
**Expected**: Task created successfully, assigned to you (self)

### Scenario 2: Task with Assignees
**File**: Task with assignees
```
Task Name: "Code Review"
Assignees: "user1@example.com, user2@example.com"
```
**Expected**: 
- Task created
- Assigned to specified users
- Delegation types determined automatically

### Scenario 3: Task with Recurrence
**File**: Weekly recurring task
```
Task Name: "Team Meeting"
Recurrence Type: "weekly"
Recurrence Config: '{"days": [1, 3, 5]}'  (Monday, Wednesday, Friday)
```
**Expected**: Task created with weekly recurrence on Mon, Wed, Fri

### Scenario 4: Task with Benchmark
**File**: Task with quantity benchmark
```
Task Name: "Process Orders"
Benchmark: 50
Recurrence Type: "daily"
```
**Expected**: Task created with benchmark of 50

### Scenario 5: Task with Dependencies
**File**: Multiple tasks with dependencies
```
Row 1: Task Name: "Task A", Recurrence Type: "none"
Row 2: Task Name: "Task B", Dependencies: "Task A"
Row 3: Task Name: "Task C", Dependencies: "Task A, Task B"
```
**Expected**: 
- All tasks created
- Task B depends on Task A
- Task C depends on both Task A and Task B

### Scenario 6: Monthly Recurrence
**File**: Monthly recurring task
```
Task Name: "Monthly Report"
Recurrence Type: "monthly"
Recurrence Config: '{"monthlyType": "date", "dayOfMonth": 15}'
```
**Expected**: Task created to recur on the 15th of each month

### Scenario 7: Error Handling - Missing Required Field
**File**: Task without name
```
Description: "This has no name"
```
**Expected**: 
- Error shown: "Row X: Task Name is required"
- Task not created
- Other valid tasks still processed

### Scenario 8: Error Handling - Invalid Benchmark
**File**: Task with negative benchmark
```
Task Name: "Test Task"
Benchmark: -5
```
**Expected**: 
- Error shown: "Row X: Benchmark must be a positive number"
- Task not created

### Scenario 9: Error Handling - Invalid Assignee
**File**: Task with non-existent assignee
```
Task Name: "Test Task"
Assignees: "nonexistent@example.com"
```
**Expected**: 
- Warning: "Row X: Assignee 'nonexistent@example.com' not found in organization"
- Task still created (assigned to self if no valid assignees)

### Scenario 10: Bulk Upload
**File**: Multiple tasks (10-20 rows)
```
Mix of different task types, some with errors
```
**Expected**: 
- Valid tasks created successfully
- Errors displayed for invalid rows
- Progress bar shows upload progress
- Success count displayed

## Step-by-Step Testing Instructions

### Test 1: Download and Use Template
1. Open Excel Upload Dialog
2. Click "Download Template"
3. Open the downloaded file
4. Modify the example data
5. Save the file
6. Upload it back
7. **Verify**: Tasks are created as expected

### Test 2: Create Custom Excel File
1. Open Excel/Google Sheets
2. Create headers: `Task Name`, `Description`, `Category`, `Benchmark`, `Recurrence Type`, `Recurrence Config`, `Assignees`, `Dependencies`
3. Add 3-5 test rows with different configurations
4. Save as `.xlsx` or `.csv`
5. Upload the file
6. **Verify**: 
   - Preview shows all tasks
   - Upload completes successfully
   - Tasks appear in Task List

### Test 3: Test CSV Format
1. Create a CSV file with the same columns
2. Use comma-separated values
3. Upload the CSV file
4. **Verify**: CSV is parsed correctly

### Test 4: Test Error Handling
1. Create a file with:
   - One row missing Task Name
   - One row with invalid benchmark
   - One row with valid data
2. Upload the file
3. **Verify**:
   - Errors are displayed clearly
   - Valid task is still created
   - Error messages show row numbers

### Test 5: Test Dependencies
1. Create tasks in order:
   - Task A (no dependencies)
   - Task B (depends on Task A)
   - Task C (depends on Task A, Task B)
2. Upload the file
3. **Verify**:
   - All tasks created
   - Dependencies are set correctly
   - Check in Task List that dependencies are displayed

### Test 6: Test Assignees
1. Create a task with assignees (use actual user emails from your organization)
2. Upload the file
3. **Verify**:
   - Task is assigned to specified users
   - Check task assignments in the UI

## What to Check After Upload

1. **Task List**: 
   - New tasks appear in the list
   - Tasks have correct names, descriptions, categories
   - Recurrence types are correct

2. **Task Details**:
   - Click on a task to view details
   - Verify benchmark, category, description
   - Check recurrence configuration

3. **Assignments**:
   - Tasks are assigned to correct users
   - Delegation types are set appropriately

4. **Dependencies**:
   - Tasks show dependencies in the Task List
   - Dependencies are clickable/visible

5. **Recurrence**:
   - Recurring tasks appear in Daily/Monthly views
   - Recurrence pattern matches configuration

## Common Issues & Solutions

### Issue: "Invalid file type"
**Solution**: Ensure file is `.xlsx`, `.xls`, or `.csv`

### Issue: "The file is empty"
**Solution**: Ensure file has data rows (not just headers)

### Issue: "Assignee not found"
**Solution**: 
- Use exact email addresses from your organization
- Or use exact full names as they appear in the system

### Issue: "Dependency not found"
**Solution**: 
- Ensure dependent task names match exactly (case-insensitive)
- Dependencies must be in the same upload file or already exist

### Issue: "Failed to parse file"
**Solution**: 
- Check file is not corrupted
- Ensure proper column headers
- Try downloading template and using that format

## Tips for Testing

1. **Start Small**: Test with 2-3 tasks first
2. **Use Template**: Download template to ensure correct format
3. **Check Preview**: Review parsed tasks before uploading
4. **Test Errors**: Intentionally create errors to verify error handling
5. **Verify Data**: Always check created tasks match your input
6. **Test Edge Cases**: Empty fields, special characters, long text

## Expected Behavior

✅ **Should Work**:
- Upload valid Excel/CSV files
- Create multiple tasks at once
- Handle assignments and dependencies
- Show progress during upload
- Display clear error messages
- Preview tasks before upload

❌ **Should Not Work**:
- Invalid file types
- Missing required fields (Task Name)
- Negative benchmarks
- Circular dependencies (handled by database)
- Assignees outside organization

## Quick Test Checklist

- [ ] Can open Excel Upload Dialog
- [ ] Can download template
- [ ] Can upload Excel file
- [ ] Can upload CSV file
- [ ] Preview shows parsed tasks
- [ ] Tasks are created successfully
- [ ] Assignees are resolved correctly
- [ ] Dependencies are set correctly
- [ ] Errors are displayed clearly
- [ ] Progress bar works
- [ ] Success message appears
- [ ] Tasks appear in Task List after upload

