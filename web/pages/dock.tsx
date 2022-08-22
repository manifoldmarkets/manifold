import { Transition } from "@headlessui/react";
import clsx from "clsx";
import { Group } from "common/group";
import { LiteMarket, LiteUser } from "common/manifold-defs";
import * as Packets from "common/packet-ids";
import { PacketCreateMarket, PacketMarketCreated } from "common/packets";
import Head from "next/head";
import { Fragment, ReactNode, useEffect, useState } from "react";
import Textarea from "react-expanding-textarea";
import io, { Socket } from "socket.io-client";
import ContractCard from "web/components/contract-card";
import { InfoTooltip } from "web/components/info-tooltip";
import { Col } from "web/components/layout/col";
import { Row } from "web/components/layout/row";
import { LoadingOverlay } from "web/components/loading-overlay";
import { Title } from "web/components/title";
import { ConnectionState } from "web/lib/connection-state";
import { CONTRACT_ANTE, formatMoney, Resolution } from "web/lib/utils";
import { ConfirmationButton } from "../components/confirmation-button";
import { GroupSelector } from "../components/group-selector";

const APIBase = "https://dev.manifold.markets/api/v0/";

async function fetchMarketsInGroup(group: Group): Promise<LiteMarket[]> {
    const r = await fetch(`${APIBase}markets`);
    let markets = (await r.json()) as LiteMarket[];
    markets = markets.filter((market) => {
        return group.contractIds.indexOf(market.id) >= 0 && !market.isResolved;
    });
    return markets;
}

async function fetchMarketById(id: string): Promise<LiteMarket> {
    const r = await fetch(`${APIBase}market/${id}`);
    const market = (await r.json()) as LiteMarket;
    return market;
}

async function getUserBalance(): Promise<number> {
    const username = "PhilBladen"; //!!!
    const r = await fetch(`${APIBase}user/${username}`);
    const user = (await r.json()) as LiteUser;
    return user.balance;
}

let socket: Socket;

export default () => {
    const [selectedGroup, setSelectedGroup] = useState<Group | undefined>(undefined);
    const [balance, setBalance] = useState(0);
    const [question, setQuestion] = useState("");
    const [loadingContracts, setLoadingContracts] = useState<boolean>(false);
    const [contracts, setContracts] = useState<LiteMarket[]>([]);
    const [selectedContract, setSelectedContract] = useState<LiteMarket | undefined>(undefined);
    const [isSubmittingQuestion, setIsSubmittingQuestion] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState("Connecting to server...");
    const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.CONNECTING);

    const ante = CONTRACT_ANTE;
    const onSubmitNewQuestion = async () => {
        setIsSubmittingQuestion(true);
        try {
            await new Promise<void>((resolve, reject) => {
                socket.emit(Packets.CREATE_MARKET, { groupId: selectedGroup.id, question: question } as PacketCreateMarket);
                socket.once(Packets.MARKET_CREATED, async (packet: PacketMarketCreated) => {
                    //!!! Need to refresh groups
                    const markets = await fetchMarketsInGroup(selectedGroup);
                    setContracts(markets);
                    for (const market of markets) {
                        if (market.id === packet.id) {
                            setSelectedContract(market);
                            break;
                        }
                    }
                    resolve();
                });
                setTimeout(reject, 5000); //!!! Handle errors nicely
            });
            return true;
        } catch (e) {
            return false;
        } finally {
            setIsSubmittingQuestion(false);
        }
    };

    useEffect(() => {
        const params = new Proxy(new URLSearchParams(window.location.search), {
            get: (searchParams, prop) => searchParams.get(prop as string),
        });
        socket = io({ query: { type: "dock", controlToken: params["t"] } });
        socket.on("connect_error", (err) => {
            console.error(err);
            setLoadingMessage(err.message);
            setConnectionState(ConnectionState.FAILED);
        });
        socket.on("connect", () => {
            console.debug("Socked connected to server.");
            setConnectionState(ConnectionState.CONNECTED);
            setSelectedContract(undefined);
        });
        socket.on("disconnect", () => {
            setConnectionState(ConnectionState.CONNECTING);
        });

        socket.on(Packets.RESOLVED, () => {
            console.log("Market resolved");
            location.reload();
        });

        socket.on(Packets.SELECT_MARKET_ID, async (marketID) => {
            console.debug("Selecting market: " + marketID);
            const market = await fetchMarketById(marketID);
            setSelectedContract(market);
        });

        socket.on(Packets.UNFEATURE_MARKET, () => {
            setSelectedContract(undefined);
        });

        getUserBalance().then((b) => setBalance(b));
    }, []);

    const onContractFeature = (contract: LiteMarket) => {
        setSelectedContract(contract);
        socket.emit(Packets.SELECT_MARKET_ID, contract?.id);
    };

    const onContractUnfeature = () => {
        socket.emit(Packets.UNFEATURE_MARKET);
        setSelectedContract(undefined);
    };

    useEffect(() => {
        if (selectedGroup) {
            setLoadingContracts(true);
            fetchMarketsInGroup(selectedGroup)
                .then((markets) => {
                    setContracts(markets);
                })
                .finally(() => {
                    setTimeout(() => setLoadingContracts(false), 0);
                });
        }
    }, [selectedGroup]);

    return (
        <>
            <Head>
                <title>Dock</title>
            </Head>
            <LoadingOverlay visible={connectionState != ConnectionState.CONNECTED} message={loadingMessage} loading={connectionState == ConnectionState.CONNECTING} />
            <div className="flex justify-center">
                <div className="max-w-xl grow flex flex-col h-screen overflow-hidden relative">
                    <div className="p-2">
                        <GroupSelector selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} />
                        <div className="w-full flex justify-center">
                            <ConfirmationButton
                                openModalBtn={{
                                    label: `Create and feature a question`,
                                    className: clsx(
                                        !selectedGroup ? "btn-disabled" : "from-indigo-500 to-blue-500 hover:from-indigo-700 hover:to-blue-700 bg-gradient-to-r border-0 w-full rounded-md",
                                        "uppercase w-full mt-2 py-2.5 text-base font-semibold text-white shadow-sm h-11"
                                    ),
                                }}
                                submitBtn={{
                                    label: "Create",
                                    className: clsx("normal-case btn", question.trim().length == 0 || ante > balance ? "btn-disabled" : isSubmittingQuestion ? "loading btn-disabled" : "btn-primary"),
                                }}
                                cancelBtn={{
                                    className: isSubmittingQuestion ? "btn-disabled" : "",
                                }}
                                onSubmitWithSuccess={onSubmitNewQuestion}
                                onOpenChanged={() => {
                                    getUserBalance().then((b) => setBalance(b));
                                }}
                            >
                                <Title className="!my-0" text={`Create a new question  ${selectedGroup ? `in '${selectedGroup.name}'` : ""}`} />

                                <form>
                                    <div className="form-control w-full">
                                        <label className="label">
                                            <span className="mb-1">
                                                Question<span className={"text-red-700"}>*</span>
                                            </span>
                                        </label>

                                        <Textarea
                                            placeholder="e.g. Will the Democrats win the 2024 US presidential election?"
                                            className="input input-bordered resize-none"
                                            autoFocus
                                            maxLength={480}
                                            value={question}
                                            onChange={(e) => setQuestion(e.target.value || "")}
                                        />
                                    </div>
                                </form>

                                <Row className="form-control mb-1 items-start">
                                    <Row className="gap-2 grow items-center justify-items-start flex">
                                        <span>Cost:</span>
                                        <InfoTooltip text={`Cost to create your question. This amount is used to subsidize betting.`} /> {/*!!!*/}
                                    </Row>

                                    <div className="label-text text-neutral pl-1 justify-self-end self-center">{`M$${ante}`} </div>
                                </Row>
                                {ante > balance && (
                                    <div className="-mt-4 mb-2 mr-auto self-center whitespace-nowrap text-xs font-medium tracking-wide">
                                        <span className="mr-2 text-red-500">Insufficient balance ({formatMoney(balance)})</span>
                                    </div>
                                )}
                            </ConfirmationButton>
                        </div>
                    </div>

                    <div className="p-2 overflow-y-auto relative grow flex flex-col">
                        {loadingContracts ? (
                            <div className="flex justify-center grow animate-fade">
                                <div style={{ borderTopColor: "transparent" }} className="w-10 h-10 border-4 border-primary border-solid rounded-full animate-spin" />
                            </div>
                        ) : contracts.length > 0 ? (
                            contracts.map((contract, index) => (
                                <Transition key={contract.id} appear show as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0 -translate-y-4" enterTo="opacity-100 translate-y-0">
                                    <div className="mb-2 hover:z-10" style={{ transitionDelay: index * 50 + "ms" }}>
                                        <ContractCard contract={contract} onFeature={() => onContractFeature(contract)} />
                                    </div>
                                </Transition>
                            ))
                        ) : (
                            selectedGroup && <p className="w-full text-center text-gray-400 select-none">No applicable markets in this group</p>
                        )}
                    </div>
                    <Transition
                        unmount={false}
                        as={Fragment}
                        show={selectedContract != undefined}
                        enter="ease-out duration-150"
                        enterFrom="opacity-0"
                        enterTo="opacity-100"
                        leave="ease-in duration-200"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" />
                    </Transition>
                    {selectedContract && (<div className={clsx("fixed inset-0 flex flex-col items-center overflow-y-auto", selectedContract ?? "pointer-events-none")}>
                        <Transition appear show as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0 -translate-y-4" enterTo="opacity-100 translate-y-0">
                            <div className="w-full max-w-xl grow flex flex-col justify-end p-2">
                                <ResolutionPanel contract={selectedContract} onUnfeatureMarket={onContractUnfeature} />
                            </div>
                        </Transition>
                    </div>)}
                </div>
            </div>
        </>
    );
};

function ResolutionPanel(props: { contract: LiteMarket; onUnfeatureMarket: () => void }) {
    const { contract, onUnfeatureMarket } = props;

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [outcome, setOutcome] = useState<Resolution | undefined>();

    // const earnedFees = contract.mechanism === "dpm-2" ? `${DPM_CREATOR_FEE * 100}% of trader profits` : `${formatMoney((contract as any).fees.creatorFee)} in fees`;

    const submitButtonClass =
        outcome === "YES"
            ? "btn-primary"
            : outcome === "NO"
            ? "bg-red-400 hover:bg-red-500"
            : outcome === "CANCEL"
            ? "bg-yellow-400 hover:bg-yellow-500"
            : outcome === "MKT"
            ? "bg-blue-400 hover:bg-blue-500"
            : "btn-disabled";

    const resolveClicked = async (): Promise<boolean> => {
        console.log("Resolve clicked: " + outcome);
        socket.emit(Packets.RESOLVE, outcome);
        setIsSubmitting(true);
        return true;
    };

    return (
        <Col className={"rounded-md bg-white px-8 py-6 cursor-default"} onClick={(e) => e.stopPropagation()}>
            <div className="whitespace-nowrap text-2xl">Resolve market</div>

            <p
                className="break-words font-semibold text-indigo-700 my-3"
                style={{
                    wordBreak: "break-word" /* For iOS safari */,
                }}
            >
                {contract.question}
            </p>

            <div className="mb-3 text-sm text-gray-500">Outcome</div>

            <YesNoCancelSelector className="mx-auto my-2" selected={outcome} onSelect={setOutcome} btnClassName={isSubmitting ? "btn-disabled" : ""} />

            <div className="my-2" />

            <div>
                {outcome === "YES" ? (
                    <>
                        Winnings will be paid out to YES bettors.
                        {/* <br /> */}
                        {/* <br /> */}
                        {/* You will earn {earnedFees}. */}
                    </>
                ) : outcome === "NO" ? (
                    <>
                        Winnings will be paid out to NO bettors.
                        {/* <br /> */}
                        {/* <br /> */}
                        {/* You will earn {earnedFees}. */}
                    </>
                ) : outcome === "CANCEL" ? (
                    <>All trades will be returned with no fees.</>
                ) : (
                    //  : outcome === "MKT" ? (
                    //     <Col className="gap-6">
                    //         <div>Traders will be paid out at the probability you specify:</div>
                    //         <ProbabilitySelector probabilityInt={Math.round(prob)} setProbabilityInt={setProb} />
                    //         You will earn {earnedFees}.
                    //     </Col>
                    // )
                    <p>Resolving this market will immediately pay out traders.</p>
                )}
            </div>

            {/* <div className="my-4" /> */}

            {/* {!!error && <div className="text-red-500">{error}</div>} */}

            <ResolveConfirmationButton onResolve={resolveClicked} isSubmitting={isSubmitting} openModalButtonClass={clsx("w-full mt-2", submitButtonClass)} submitButtonClass={submitButtonClass} />
            <ConfirmationButton
                openModalBtn={{
                    className: clsx("border-none self-start w-full mt-2", isSubmitting ? "btn-disabled" : ""),
                    label: "Unfeature market",
                }}
                cancelBtn={{
                    label: "Back",
                }}
                submitBtn={{
                    label: "Unfeature",
                    className: clsx("border-none btn-primary"),
                }}
                onSubmitWithSuccess={async () => {
                    onUnfeatureMarket();
                    return true;
                }}
            >
                <p>
                    Are you sure you want to unfeature this market? <b>You will have to resolve it later on the Manifold website.</b>
                </p>
            </ConfirmationButton>
        </Col>
    );
}

export function ResolveConfirmationButton(props: { onResolve: () => Promise<boolean>; isSubmitting: boolean; openModalButtonClass?: string; submitButtonClass?: string }) {
    const { onResolve, isSubmitting, openModalButtonClass, submitButtonClass } = props;
    return (
        <ConfirmationButton
            openModalBtn={{
                className: clsx("border-none self-start", openModalButtonClass, isSubmitting && "btn-disabled loading"),
                label: "Resolve",
            }}
            cancelBtn={{
                label: "Back",
            }}
            submitBtn={{
                label: "Resolve",
                className: clsx("border-none", submitButtonClass),
            }}
            onSubmitWithSuccess={onResolve}
        >
            <p>Are you sure you want to resolve this market?</p>
        </ConfirmationButton>
    );
}

export function YesNoCancelSelector(props: { selected: Resolution | undefined; onSelect: (selected: Resolution) => void; className?: string; btnClassName?: string }) {
    const { selected, onSelect } = props;

    const btnClassName = clsx("px-6 flex-1 rounded-3xl", props.btnClassName);

    return (
        <Col className="gap-2">
            {/* Should ideally use a radio group instead of buttons */}
            <Button color={selected === "YES" ? "green" : "gray"} onClick={() => onSelect("YES")} className={btnClassName}>
                YES
            </Button>

            <Button color={selected === "NO" ? "red" : "gray"} onClick={() => onSelect("NO")} className={btnClassName}>
                NO
            </Button>

            {/* <Button color={selected === "MKT" ? "blue" : "gray"} onClick={() => onSelect("MKT")} className={clsx(btnClassName, "btn-sm")}>
                PROB
            </Button> */}

            <Button color={selected === "CANCEL" ? "yellow" : "gray"} onClick={() => onSelect("CANCEL")} className={clsx(btnClassName, "btn-sm")}>
                N/A
            </Button>
        </Col>
    );
}

function Button(props: { className?: string; onClick?: () => void; color: "green" | "red" | "blue" | "indigo" | "yellow" | "gray"; children?: ReactNode }) {
    const { className, onClick, children, color } = props;

    return (
        <button
            type="button"
            className={clsx(
                "inline-flex flex-1 items-center justify-center rounded-md border border-transparent px-8 py-3 font-medium shadow-sm",
                color === "green" && "btn-primary text-white",
                color === "red" && "bg-red-400 text-white hover:bg-red-500",
                color === "yellow" && "bg-yellow-400 text-white hover:bg-yellow-500",
                color === "blue" && "bg-blue-400 text-white hover:bg-blue-500",
                color === "indigo" && "bg-indigo-500 text-white hover:bg-indigo-600",
                color === "gray" && "bg-gray-200 text-gray-700 hover:bg-gray-300",
                className
            )}
            onClick={(e) => {
                onClick && onClick();
                e.stopPropagation();
            }}
        >
            {children}
        </button>
    );
}
