#!/bin/sh
# Starts as root only long enough to make the uploads volume writable by the app's user, then runs the app as that user.
# A named volume created before the image chowned its folder stays root-owned, and every upload then fails with EACCES.
# The check is one stat call, so after the first fix this costs nothing.
set -e
mkdir -p /app/uploads
if [ "$(stat -c %U /app/uploads)" != "node" ]; then
  chown -R node:node /app/uploads
fi
exec su-exec node "$@"
