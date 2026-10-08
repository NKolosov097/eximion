# Console warning diagnosis

The reported source URL is `chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/scripts/contentscript.js`. This ID belongs to [MetaMask](https://chromewebstore.google.com/detail/metamask/nkbihfbeogaeaoehlefnkodbefgpgknn); the supplied bundle identifies SES/LavaMoat. It is extension code. The supplied source is not a stack trace and does not identify the exact repeated listener registration.

The clinical-case test application has no wallet integration or application EventEmitter/listener-limit override. A clean Chrome profile navigated the deployed home, case and author routes 12 times without MaxListenersExceededWarning or page exceptions; see console-check.json. It recorded one unrelated favicon.ico 404. The clean-profile result does not establish which MetaMask operation causes the warning in the user's profile.

No listener limit was raised and no warning was suppressed. To isolate locally, restrict MetaMask access to this site or use a browser profile without extensions and reload. Do not reset or remove the wallet to diagnose a page warning.
