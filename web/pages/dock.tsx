import { GroupSelector } from "../components/group-selector";
import { LiteMarket, LiteUser } from "common/manifold-defs";
import { Group } from "common/group";
import clsx from "clsx";
import { ConfirmationButton } from "../components/confirmation-button";
import { Title } from "web/components/title";
import { Fragment, ReactNode, useEffect, useState } from "react";
import Textarea from "react-expanding-textarea";
import { InfoTooltip } from "web/components/info-tooltip";
import { Row } from "web/components/layout/row";
import { Col } from "web/components/layout/col";
import { Avatar } from "web/components/avatar";
import Link from "next/link";
import { TrendingUpIcon } from "@heroicons/react/outline";
import { SparklesIcon } from "@heroicons/react/solid";
import { Transition } from "@headlessui/react";

const APIBase = "https://dev.manifold.markets/api/v0/";
const dummyUser: LiteUser = { id: "asdasdfgdsef" } as LiteUser;

async function fetchMarketsInGroup(group: Group): Promise<LiteMarket[]> {
    const r = await fetch(`${APIBase}markets`);
    let markets = (await r.json()) as LiteMarket[];
    markets = markets.filter((market) => {
        return market.outcomeType == "BINARY" && group.contractIds.indexOf(market.id) >= 0;
    });
    return markets;
}

export default () => {
    const [selectedGroup, setSelectedGroup] = useState<Group | undefined>(undefined);

    const isSubmitting = false;
    const className = "";
    const onSubmit = async () => {
        return false;
    };
    const onOpenStateChange = (isOpen: boolean) => {
        /**/
    };
    const updateMemberUsers = (users: unknown) => {
        /** */
    };
    const setName = (name: string) => {
        /** */
    };

    const [question, setQuestion] = useState("");
    const ante = 100;
    const balance = 100; //!!!
    const showQuickBet = true;

    const [loadingContracts, setLoadingContracts] = useState<boolean>(false);
    const [contracts, setContracts] = useState<LiteMarket[]>([]);
    const [selectedContract, setSelectedContract] = useState<LiteMarket | undefined>(undefined);
    // if (selectedGroup) {
    //     fetchMarketsInGroup(selectedGroup).then((markets) => {
    //         setContracts(markets);
    //     });
    // }

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
        <div className="flex justify-center">
            <div className="max-w-xl grow flex flex-col h-screen overflow-hidden relative">
                <div className="p-2">
                    <div className="w-full flex justify-center">
                        <ConfirmationButton
                            openModalBtn={{
                                label: "Create and feature a question",
                                className: clsx(isSubmitting ? "loading btn-disabled" : "btn-primary", "uppercase w-full max-w-sm", className),
                            }}
                            submitBtn={{
                                label: "Create",
                                className: clsx("normal-case", isSubmitting ? "loading btn-disabled" : " btn-primary"),
                            }}
                            onSubmitWithSuccess={onSubmit}
                            onOpenChanged={(isOpen) => {
                                onOpenStateChange?.(isOpen);
                                updateMemberUsers([]);
                                setName("");
                            }}
                        >
                            <Title className="!my-0" text="Create a new question" />

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
                                <Row className="mb-1 gap-2 grow items-center justify-items-start flex">
                                    <span>Cost:</span>
                                    <InfoTooltip text={`Cost to create your question. This amount is used to subsidize betting.`} />
                                </Row>

                                <div className="label-text text-neutral pl-1 justify-self-end self-center pb-1">{`M$${ante}`} </div>

                                {ante > balance && (
                                    <div className="mb-2 mt-2 mr-auto self-center whitespace-nowrap text-xs font-medium tracking-wide">
                                        <span className="mr-2 text-red-500">Insufficient balance</span>
                                        <button className="btn btn-xs btn-primary" onClick={() => (window.location.href = "/add-funds")}>
                                            Get M$
                                        </button>
                                    </div>
                                )}
                            </Row>
                        </ConfirmationButton>
                    </div>
                    <div>
                        {/* <label className="label"></label> */}
                        <div className="my-4"></div>
                        <GroupSelector selectedGroup={selectedGroup} setSelectedGroup={setSelectedGroup} creator={dummyUser} options={{ showSelector: true, showLabel: true }}></GroupSelector>
                    </div>
                </div>

                {/* <div className="h-32 w-32"> */}

                {/* </div> */}

                <div className="p-2 overflow-y-auto relative grow flex flex-col">
                    {loadingContracts ? (
                        <div className="flex justify-center grow animate-fade">
                            <div style={{ borderTopColor: "transparent" }} className="w-10 h-10 border-4 border-primary border-solid rounded-full animate-spin" />
                        </div>
                    ) : contracts.length > 0 ? (
                        contracts.map((contract, index) => (
                            <Transition key={contract.id} appear show as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0 -translate-y-4" enterTo="opacity-100 translate-y-0">
                                <div className="mb-2" style={{ transitionDelay: index * 50 + "ms" }}>
                                    <Col className={clsx("relative gap-3 rounded-lg bg-white py-4 pl-6 pr-5 shadow-md hover:cursor-pointer hover:bg-gray-100", className)}>
                                        <Row>
                                            <Col className="relative flex-1 gap-3 pr-1">
                                                <div className={clsx("peer absolute -left-6 -top-4 -bottom-4 right-0")}></div>
                                                <AvatarDetails contract={contract} />
                                                <p
                                                    className="break-words font-semibold text-indigo-700 peer-hover:underline peer-hover:decoration-indigo-400 peer-hover:decoration-2"
                                                    style={{
                                                        /* For iOS safari */ wordBreak: "break-word",
                                                    }}
                                                >
                                                    {contract.question}
                                                </p>

                                                <Row className="max-w-sm">
                                                    <MiscDetails contract={contract} />
                                                </Row>
                                            </Col>
                                            <Col className="pl-2">
                                                {contract.outcomeType === "BINARY" && <BinaryResolutionOrChance className="items-center" contract={contract} />}
                                                <ProbBar previewProb={contract.probability} />
                                                <div className="grow"></div>
                                                <button className="z-40 btn btn-sm btn-outline btn-secondary border-2 rounded-lg" onClick={() => setSelectedContract(contract)}>
                                                    Feature
                                                </button>
                                            </Col>
                                        </Row>
                                    </Col>
                                </div>
                            </Transition>
                        ))
                    ) : (
                        <p className="w-full text-center text-gray-400 select-none">No applicable markets in this group</p>
                    )}
                </div>
                <Transition
                    as={Fragment}
                    show={selectedContract != undefined}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="absolute min-h-screen w-full flex flex-col justify-end backdrop-blur-sm cursor-pointer" onClick={() => setSelectedContract(undefined)}>
                        {selectedContract && (
                            <Transition appear show enter="ease-out duration-300" enterFrom="opacity-0 translate-y-4" enterTo="opacity-100 translate-y-0">
                                <ResolutionPanel contract={selectedContract} onCancelClick={() => setSelectedContract(undefined)} />
                            </Transition>
                        )}
                    </div>
                </Transition>
            </div>
        </div>
    );
};

export const DPM_CREATOR_FEE = 0.04;
type resolution = "YES" | "NO" | "CANCEL" | "MKT";

function ResolutionPanel({ contract, onCancelClick }: { contract: LiteMarket; onCancelClick: () => void }) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [outcome, setOutcome] = useState<resolution | undefined>();

    console.log(contract);
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

    return (
        <Col className={"rounded-md bg-white px-8 py-6 cursor-default"} onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 whitespace-nowrap text-2xl">Resolve market</div>

            <div className="mb-3 text-sm text-gray-500">Outcome</div>

            <YesNoCancelSelector className="mx-auto my-2" selected={outcome} onSelect={setOutcome} btnClassName={isSubmitting ? "btn-disabled" : ""} />

            <div className="my-4" />

            <div>
                {outcome === "YES" ? (
                    <>
                        Winnings will be paid out to YES bettors.
                        <br />
                        <br />
                        {/* You will earn {earnedFees}. */}
                    </>
                ) : outcome === "NO" ? (
                    <>
                        Winnings will be paid out to NO bettors.
                        <br />
                        <br />
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
                    <>Resolving this market will immediately pay out traders.</>
                )}
            </div>

            <div className="my-4" />

            {/* {!!error && <div className="text-red-500">{error}</div>} */}

            <ResolveConfirmationButton
                onResolve={() => {
                    /** */
                }}
                isSubmitting={isSubmitting}
                openModalButtonClass={clsx("w-full mt-2", submitButtonClass)}
                submitButtonClass={submitButtonClass}
            />
        </Col>
    );
}

export function ResolveConfirmationButton(props: { onResolve: () => void; isSubmitting: boolean; openModalButtonClass?: string; submitButtonClass?: string }) {
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
            onSubmit={onResolve}
        >
            <p>Are you sure you want to resolve this market?</p>
        </ConfirmationButton>
    );
}

export function YesNoCancelSelector(props: { selected: resolution | undefined; onSelect: (selected: resolution) => void; className?: string; btnClassName?: string }) {
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

const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
});
export function formatMoney(amount: number) {
    const newAmount = Math.round(amount) === 0 ? 0 : Math.floor(amount); // handle -0 case
    return "M$" + formatter.format(newAmount).replace("$", "");
}

function NewContractBadge() {
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3  py-0.5 text-sm font-medium text-blue-800">
            <SparklesIcon className="h-4 w-4" aria-hidden="true" /> New
        </span>
    );
}

const DAY_MS = 24 * 60 * 60 * 1000;
export function MiscDetails(props: { contract: LiteMarket; showHotVolume?: boolean; showTime?: boolean; hideGroupLink?: boolean }) {
    const { contract, showHotVolume, showTime, hideGroupLink } = props;
    const { volume, volume24Hours, closeTime, isResolved, createdTime, resolutionTime } = contract;

    const isNew = createdTime > Date.now() - DAY_MS && !isResolved;

    return (
        <Row className="items-center gap-3 text-sm text-gray-400 w-full">
            {showHotVolume ? (
                <Row className="gap-0.5">
                    <TrendingUpIcon className="h-5 w-5" /> {formatMoney(volume24Hours)}
                </Row>
            ) : volume > 0 || !isNew ? (
                <Row className={"shrink-0"}>{formatMoney(contract.volume)} bet</Row>
            ) : (
                <NewContractBadge />
            )}
        </Row>
    );
}

export function AvatarDetails(props: { contract: LiteMarket }) {
    const { contract } = props;
    const { creatorName, creatorUsername } = contract;

    return (
        <Row className="items-center gap-2 text-sm text-gray-400">
            <Avatar username={creatorUsername} avatarUrl={contract.creatorAvatarUrl} size={6} />
            <p className="break-words hover:underline hover:decoration-indigo-400 hover:decoration-2">{creatorName}</p>
        </Row>
    );
}

export function ProbBar(props: { previewProb?: number }) {
    const { previewProb } = props;
    const color = "bg-primary";
    const prob = previewProb ?? 0.5;
    return (
        <>
            <div className={clsx("absolute right-0 top-0 w-1.5 rounded-tr-md transition-all", "bg-gray-100")} style={{ height: `${100 * (1 - prob)}%` }} />
            <div
                className={clsx(
                    "absolute right-0 bottom-0 w-1.5 rounded-br-md transition-all",
                    `${color}`,
                    // If we're showing the full bar, also round the top
                    prob === 1 ? "rounded-tr-md" : ""
                )}
                style={{ height: `${100 * prob}%` }}
            />
        </>
    );
}

export function BinaryResolutionOrChance(props: { contract: LiteMarket; large?: boolean; className?: string }) {
    const { contract, large, className } = props;
    const { resolution } = contract;
    // const textColor = `text-${getColor(contract)}`
    const textColor = "text-primary"; //!!!

    return (
        <Col className={clsx(large ? "text-4xl" : "text-3xl", className)}>
            {resolution ? (
                <>
                    <div className={clsx("text-gray-500", large ? "text-xl" : "text-base")}>Resolved</div>
                    <BinaryContractOutcomeLabel contract={contract} resolution={resolution} />
                </>
            ) : (
                <>
                    <div className={textColor}>{(contract.probability * 100).toFixed(0)}%</div>
                    <div className={clsx("-my-1", textColor, large ? "text-xl" : "text-base")}>chance</div>
                </>
            )}
        </Col>
    );
}

export function BinaryContractOutcomeLabel(props: { contract: LiteMarket; resolution: string }) {
    const { contract, resolution } = props;

    return <BinaryOutcomeLabel outcome={resolution} />;
}

export function BinaryOutcomeLabel(props: { outcome: string }) {
    const { outcome } = props;

    if (outcome === "YES") return <YesLabel />;
    if (outcome === "NO") return <NoLabel />;
    if (outcome === "MKT") return <ProbLabel />;
    return <CancelLabel />;
}

export function YesLabel() {
    return <span className="text-primary">YES</span>;
}

export function HigherLabel() {
    return <span className="text-primary">HIGHER</span>;
}

export function LowerLabel() {
    return <span className="text-red-400">LOWER</span>;
}

export function NoLabel() {
    return <span className="text-red-400">NO</span>;
}

export function CancelLabel() {
    return <span className="text-yellow-400">N/A</span>;
}

export function ProbLabel() {
    return <span className="text-blue-400">PROB</span>;
}
