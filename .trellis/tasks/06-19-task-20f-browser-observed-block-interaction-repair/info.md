# Task 20f Technical Notes

## Core Relationship

The product data relationship is still simple:

`DocumentEditorPage` owns document lifecycle → `JixiaEditor` owns the BlockNote runtime and snapshot conversion → media/code blocks own local interaction → `uploadAttachment` owns the app upload contract → API/local object storage own permissions, object keys, signed upload/download, and confirmation.

The failure in Task 20e came from violating that simplicity: custom React handlers were added around BlockNote while BlockNote's native file upload/file panel route stayed disabled, and tests proved synthetic handlers instead of the real browser path.

## Bad Special Cases To Remove

- Hidden hover-only code controls are a bad special case. Mature editors show block-local controls in a visible selected/header region.
- Hidden file input buried inside a custom atomic block is a bad special case if BlockNote already has file insertion hooks.
- Runtime upload props inside block props are acceptable only as transient UI state; persisted snapshots must drop them.
- A green unit test for `onClick` is not evidence that BlockNote's contentEditable wrapper lets the real user click the card.

## Preferred Implementation Shape

1. Start with browser reproduction and network evidence.
2. Fix direct upload first if browser `fetch` fails before confirmation: inspect `OPTIONS`, `PUT`, origin, public base URL, request headers, allowed origins, and local service reachability.
3. Use BlockNote-native upload/file APIs if possible:
   - configure `uploadFile(file, blockId?)` to create Jixia upload intent, direct upload, confirm, and return safe app-owned props or a private app URL token,
   - configure `resolveFileUrl` so render/open resolves through server-authorized download rather than storing signed URLs,
   - enable or replace file panel only after it uses the private attachment contract safely.
4. If native BlockNote file path cannot represent Jixia attachment IDs safely, keep custom blocks but move file handling to an editor-engine-level handler that computes drop position and proves events in Playwright.
5. Make code block controls persistently visible when selected/focused and obvious at rest; keep read-only mutation controls hidden.

## Required Proof

- Browser Network shows upload intent → direct local-object-storage PUT → confirm → signed download.
- Browser UI shows visible code controls and media click/upload response.
- Saved snapshot contains only app-owned attachment IDs and safe metadata.
- Notebook and Project documents use the same editor path.

## Do Not Do

- Do not add another abstraction layer just to hide the bug.
- Do not patch around CORS by allowing credentials or wildcards that weaken storage boundaries.
- Do not store signed URLs or raw local-object-storage paths in documents.
- Do not split Notebook and Project editors.
- Do not claim success without reproducing the manual browser path.
