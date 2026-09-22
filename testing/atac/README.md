# ATAC Test Scenarios

This folder contains ready-to-import API scenarios for **ATAC**.

## Files

- `barber-academy.collection.postman.json` — main request collection (scenario groups A-F)
- `barber-academy.environment.postman.json` — environment variables template
- `fixtures/homework-sample.txt` — sample file for multipart homework upload

## 1) Start API for local testing

Run API with Telegram WebApp auth disabled for smoke tests:

```bash
TG_WEBAPP_AUTH=off npm run api
```

## 2) Import collection and environment into ATAC

Use a dedicated local ATAC workspace:

```bash
atac --directory testing/atac/.atac
```

In another terminal, import files:

```bash
atac-import --directory testing/atac/.atac "testing/atac/barber-academy.collection.postman.json"
atac-import --directory testing/atac/.atac "testing/atac/barber-academy.environment.postman.json"
```

Then open ATAC again with the same directory:

```bash
atac --directory testing/atac/.atac
```

## 3) Configure variable values

Set real values in imported environment:

- `baseUrl` (default: `http://localhost:8787`)
- `adminTelegramId`
- `teacherTelegramId`
- `studentTelegramId`
- `teacherId` (internal DB id from `teachers.id`)
- `studentId` (internal DB id from `students.id`)
- `homeworkId` (set after homework creation)
- `homeworkFilePath` (default: `testing/atac/fixtures/homework-sample.txt`)

## 4) Recommended run order

1. **A - Session and Base Checks**
2. **B - Student Moderation**
3. **C - Teacher Assignment**
4. **D - Student Homework Submit**
5. Update `homeworkId` from response (`data.homework.id`)
6. **E - Teacher Review**
7. **F - Notifications and Audit**

## 5) Expected checks

- Student is `active` after moderation
- Teacher sees assigned student
- Homework appears in student and teacher lists
- Teacher review returns success
- Notifications endpoint returns new items
- Audit endpoint includes recent admin/teacher actions

## Notes

- Collection uses Russian server error messages as-is to match backend behavior.
- If you enable `TG_WEBAPP_AUTH=optional|strict`, add valid `X-Telegram-Init-Data` header in requests.
