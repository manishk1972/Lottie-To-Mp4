import express from "express";
import puppeteer from "puppeteer";
// import nike from "./assets/nike.json" assert { type: "json" };
import fluent_ffmpeg from "fluent-ffmpeg";
import { Readable } from "stream";
import fs from "fs";
import multer from "multer";
import dotenv from "dotenv";

dotenv.config();

const upload = multer();
const app = express();
const port = process.env.port;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

async function downloadVideoFromLottie(animationData) {
    return new Promise(async (resolve, reject) => {
        // Launch Puppeteer
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        // Create an in-memory stream for screenshots
        const screenshots = [];

        // Load the temporary HTML file
        await page.setContent(`
        <!DOCTYPE html>
        <html>
        <body>
        <div id="lottie"></div>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.7.8/lottie.min.js"></script>
        <script>
            var animation = lottie.loadAnimation({
                container: document.getElementById('lottie'),
                renderer: 'svg',
                loop: false,
                autoplay: false,
                animationData: ${animationData}
            });
            window.animation = animation;
        </script>
        </body>
        </html>
    `);

        // Get the total number of frames
        const totalFrames = await page.evaluate(
            () => window.animation.totalFrames
        );

        // Loop over each frame
        for (let i = 0; i < 15; i++) {
            // Go to the current frame
            await page.evaluate(
                (frame) => window.animation.goToAndStop(frame, true),
                i
            );

            // Set the viewport size to the desired dimensions
            await page.setViewport({ width: 720, height: 1280 });

            // Wait for the SVG to render
            await page.waitForTimeout(0.1);

            // Take a screenshot of the current frame and push it to the in-memory stream
            screenshots.push(
                await page.screenshot({
                    encoding: "binary",
                    clip: { x: 0, y: 0, width: 720, height: 1280 },
                })
            );
        }

        // Close Puppeteer
        await browser.close();

        // Create an in-memory stream from the screenshots
        const screenshotStream = new Readable();
        screenshotStream._read = function () {};
        screenshots.forEach((screenshot) => screenshotStream.push(screenshot));
        screenshotStream.push(null);

        fluent_ffmpeg()
            .input(screenshotStream)
            .inputFormat("image2pipe")
            .inputFps(30)
            .output("out.mp4")
            .outputFps(25)
            .outputFormat("mp4")
            .on("end", () => {
                console.log("Conversion finished!");
                resolve();
            })
            .on("error", (err) => {
                console.error(`Error: ${err}`);
                reject(err);
            })
            .run();
    });
}

app.get("/", (req, res) => {
    res.send({
        message: "api is working now!!!",
    });
}); 

app.post("/getVideoInMp4", upload.none(), async (req, res) => {
    const animationData = req.body.animationData;
    await downloadVideoFromLottie(animationData);
    const videoBuffer = fs.readFileSync("out.mp4");
    const base64Video = videoBuffer.toString("base64");
    res.send({ video: base64Video });
});

app.listen(port, () => {
    console.log(`Server is running at: ${port}`);
});
