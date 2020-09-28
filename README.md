Add this roam/js code
```
import('https://cdn.jsdelivr.net/gh/Roam-Research/roamjs/scripts/window-hello-world.js')
 .then(_ => window.helloWorld("hello", "world"))
```

The https://cdn.jsdelivr.net/gh/Roam-Research/roamjs/scripts/window-hello-world.js URL serves
the content of https://github.com/Roam-Research/roamjs/blob/master/scripts/window-hello-world.js as
shown in https://stackoverflow.com/questions/17341122/link-and-execute-external-javascript-file-hosted-on-github.