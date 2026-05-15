# Mockup for Science Portal searching the SDS TAP service

## Running it
Use Docker to start a web server:
```sh
git clone https://github.com/at88mph/science-portal-sds-mockup.git
cd science-portal-sds-mockup
docker run --rm -ti -p 8000:80 -v $(pwd):/usr/share/nginx/html nginx
```

Then visit http://localhost:8000/science-portal/.  The end slash is important.

## Changes

There is now a `Search...` button that will bring up the new search modal.  This is *a mockup only* to seek from the `images.json` file.
