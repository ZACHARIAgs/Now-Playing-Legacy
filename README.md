# Spotify Now Playing Display

A beautifully responsive, lightweight, and hardware-accelerated "Now Playing" web application for Spotify.

## Just go to https://zachariags.github.io/Now-Playing-Legacy/
https://zachariags.github.io/Now-Playing-Legacy/?import_token=AQA4qgpMUp3FwglSPEX6veehcGj-kZbEBSP80LWfsr7EqhAoxEa4WvZyDbuYJgLFETDe4FKuhK-7cg6h4xLJ3YS9Z1GiGQr45fi8uO8Nl9oauIyDDqpuhuxwZkUa1gb_nMA

https://zachariags.github.io/Now-Playing-Legacy/?import_token=AQCCufGVK3jz3nE1yvI7FCr4AwtMZxExVy-m0ausXemlNkmHbITSA_lHUAbu9imYG-ciOMJ_lN4o3v8qDIWcXZIb_X8CVwJGzoSQxISRwKyxiUtj_WPx2bM0gvtzjNIhAKg

This project was built to transform any unused screen into a cool music display. By running entirely in the browser using HTML, CSS, and Vanilla JavaScript with no backend required, it's incredibly portable. Whether you're displaying it on a secondary PC monitor, mounting an old iPad on the wall, or converting a dusty Kindle, this app is great. 

### Features
**Immersive UI:** A full-screen, blurred, and rotating background that adapts to the current album art.  
**Potato Ready:** The animations are optimized using GPU hardware acceleration (`translate3d`), meaning it respects battery life even on old hardware.  
**Fully Responsive:** Custom portrait and landscape layout modes. When standing up, the UI stacks vertically. When in landscape, it spreads out horizontally.  

### Running on an old Android Tablet
This project was originally built explicitly to give an old Amazon Kindle Fire 7 a second life! 
If you want to use it as an always-on dashboard on a tablet:
1. Download a kiosk application onto your tablet (such as **Fully Kiosk Browser**).
2. Set the "Start URL" to `zachariags.github.io/Now-Playing-Web`
3. Connect to your Spotify account, and lock it into full-screen mode!

*Note: If using an older Kindle or Android device with an outdated certificate store, be sure to use Cloudflare Pages or enable "Ignore SSL Errors" in your Kiosk browser settings to ensure a smooth connection!*

### Landscape Mode:
<img width="1045" height="642" alt="image" src="https://github.com/user-attachments/assets/aa691a19-5281-4a55-acf6-a5334104dbae" />

### Portrait Mode:
<img width="550" height="784" alt="image" src="https://github.com/user-attachments/assets/e3135585-70ad-4b52-9a0d-7854483b267c" />
