import clsx from "clsx";
import Head from "next/head";
import { Fragment, useEffect, useState } from "react";
import { Col } from "web/components/layout/col";
import { Row } from "web/components/layout/row";
import { PaperAirplaneIcon, RefreshIcon } from "@heroicons/react/solid";
import { Transition } from "@headlessui/react";

export default () => {
    const [toastVisible, setToastVisible] = useState(false);
    const [toastMessage, setToastMessage] = useState("");
    let currentTimeout: NodeJS.Timeout = null;

    const [inputError, setInputError] = useState(0);

    async function signup() {
        setInputError(0);

        let error = false;
        const mUsernameElement = document.getElementById("musername") as HTMLInputElement;
        if (mUsernameElement.value.length <= 0) {
            setInputError(i => i | 0x1);
            error = true;
        }

        const apiKeyElement = document.getElementById("apikey") as HTMLInputElement;
        if (apiKeyElement.value.length <= 0) {
            setInputError(i => i | 0x2);
            error = true;
        }

        if (!error) {
            try {
                mUsernameElement.disabled = true;
                apiKeyElement.disabled = true;
                (document.getElementById("signup") as HTMLButtonElement).disabled = true;
                document.getElementById("errorMessage").innerHTML = "";

                const response = await fetch(`api/linkInit`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        manifoldUsername: mUsernameElement.value,
                        apiKey: apiKeyElement.value,
                    }),
                });
                const responseData = await response.json();
                if (response.status != 200) {
                    console.error(responseData);
                    document.getElementById("errorMessage").innerHTML = responseData.message;
                    return;
                }                
                window.open(responseData.twitchAuthURL);
            } finally {
                mUsernameElement.disabled = false;
                apiKeyElement.disabled = false;
                (document.getElementById("signup") as HTMLButtonElement).disabled = false;
            }
        }
    }

    const showToast = (message: string) => {
        setToastMessage(message);
        setToastVisible(true);
        if (currentTimeout) {
            clearTimeout(currentTimeout);
        }
        currentTimeout = setTimeout(() => setToastVisible(false), 1000);
    };

    useEffect(() => {
        const sessionId = crypto.randomUUID();

        document.getElementById("signup").addEventListener("click", () => {
            signup();
        });

        document.getElementById("copyOverlayLink").addEventListener("click", () => {
            navigator.clipboard.writeText(`http://localhost:19823/?session=${sessionId}`).then(() => showToast("Copied overlay link to clipboard."));
        });
        document.getElementById("copyDockLink").addEventListener("click", () => {
            navigator.clipboard.writeText(`http://localhost:19823/dock.html?session=${sessionId}`).then(() => showToast("Copied dock link to clipboard."));
        });
    }, []);

    const onAddBot = async () => {
        const response = await (await fetch("api/botJoinURL")).json();
        window.open(response.url);
    }

    return (
        <>
            <Head>
                <title>Signup</title>
                <meta name="viewport" />
            </Head>
            <Col className="absolute inset-0 justify-center items-center">
                <Col className="bg-white rounded p-6 shadow-md max-w-lg h-full m-4 items-stretch gap-2">
                    <Col className="rounded-lg p-2.5 border">
                        <p className="text-2xl pb-2.5 m-0 w-full text-center text-gray-500">Link Twitch and Manifold account</p>
                        <Row className="gap-4">
                            <input id="musername" placeholder="Manifold username" className={clsx("input rounded input-bordered w-full placeholder:text-gray-300", (inputError & 0x1) && "border-red-400")} />
                            <input id="apikey" placeholder="Manifold API key" className={clsx("input rounded input-bordered w-full placeholder:text-gray-300", (inputError & 0x2) && "border-red-400")} />
                        </Row>
                        <p id="errorMessage" className="text-red-400 text-sm pb-2.5 m-0"></p>
                        <Row className={clsx("mt-[0.1em] justify-center")}>
                            <button id="signup" className="btn btn-primary">
                                Signup
                            </button>
                        </Row>
                    </Col>

                    <div>
                        <label className="label text-normal">Session key</label>
                        <div className="input-group w-full">
                            <input type="text" placeholder="Click refresh to generate key" className="input input-bordered w-full" readOnly />
                            <button className="btn btn-primary btn-square p-2">
                                <RefreshIcon />
                            </button>
                        </div>
                    </div>

                    <Row className="">
                        <a id="addbot" target="_blank" className="btn btn-primary grow" onClick={onAddBot}>
                            Add bot to your channel
                        </a>
                    </Row>
                    <Row className="gap-2">
                        <button id="copyOverlayLink" className="btn btn-primary grow">
                            Copy overlay link
                        </button>
                        <button id="copyDockLink" className="btn btn-primary grow">
                            Copy dock link
                        </button>
                    </Row>
                </Col>
            </Col>

            <Transition
                show={toastVisible}
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 translate-y-4"
                enterTo="opacity-100 translate-y-0"
                leave="ease-in duration-200"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
            >
                <div className="absolute inset-8 flex flex-col items-center justify-end pointer-events-none">
                    <div
                        id="toast-simple"
                        className="flex items-center p-4 space-x-4 w-full max-w-xs text-gray-500 bg-white rounded-lg divide-x divide-gray-200 shadow dark:text-gray-400 dark:divide-gray-700 space-x dark:bg-gray-800"
                        role="alert"
                    >
                        <div className="w-6 h-6">
                            <PaperAirplaneIcon className="fill-blue-600" />
                        </div>
                        <div className="pl-4 text-sm font-normal">{toastMessage}</div>
                    </div>
                </div>
            </Transition>
        </>
    );
};
