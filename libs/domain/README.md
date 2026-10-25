# @simmery/domain

Business rules shared by the JSON API and the MCP server (KTD2). Every operation takes the database and the caller's user ID and only ever reads or writes that user's rows; another user's row looks the same as a missing one (`NotFoundError`).

Tests run against PGlite with the committed migrations (`@simmery/db/testing`).
