import { GroupSelector } from "../components/group-selector";
import { LiteMarket, LiteUser } from "common/manifold-defs";
import { Group } from "common/group";
import clsx from "clsx";
import { ConfirmationButton } from "../components/confirmation-button";
import { Title } from "web/components/title";
import { ReactNode, useEffect, useState } from "react";
import Textarea from "react-expanding-textarea";
import { InfoTooltip } from "web/components/info-tooltip";
import { Row } from "web/components/layout/row";
import { Col } from "web/components/layout/col";
import { Avatar } from "web/components/avatar";
import Link from "next/link";
import { TrendingUpIcon } from "@heroicons/react/outline";
import { SparklesIcon } from "@heroicons/react/solid";

const APIBase = "https://dev.manifold.markets/api/v0/";
const dummyUser: LiteUser = { id: "asdasdfgdsef" } as LiteUser;

async function fetchMarketsInGroup(group: Group): Promise<LiteMarket[]> {
    const r = await fetch(`${APIBase}markets`);
    let markets = (await r.json()) as LiteMarket[];
    markets = markets.filter((market) => {
        return market.outcomeType == "BINARY" && group.contractIds.indexOf(market.id) >= 0;
    });
    for (const market of markets) {
        console.log(market.url);
    }
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

    const [contracts, setContracts] = useState<LiteMarket[]>([]);
    // if (selectedGroup) {
    //     fetchMarketsInGroup(selectedGroup).then((markets) => {
    //         setContracts(markets);
    //     });
    // }

    useEffect(() => {
        if (selectedGroup) {
            fetchMarketsInGroup(selectedGroup).then((markets) => {
                setContracts(markets);
            });
            console.log("New group selected: " + selectedGroup.name);
        }
    }, [selectedGroup]);

    return (
        <div className="flex justify-center">
            <div className="max-w-xl grow flex flex-col h-screen overflow-hidden">
                <div className="p-2">
                    <div className="w-full flex justify-center">
                        <ConfirmationButton
                            openModalBtn={{
                                label: "Create and feature a question",
                                className: clsx(
                                    isSubmitting ? "loading btn-disabled" : "btn-primary",
                                    "uppercase w-full max-w-sm",
                                    className
                                ),
                            }}
                            submitBtn={{
                                label: "Create",
                                className: clsx(
                                    "normal-case",
                                    isSubmitting ? "loading btn-disabled" : " btn-primary"
                                ),
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
                                    <InfoTooltip
                                        text={`Cost to create your question. This amount is used to subsidize betting.`}
                                    />
                                </Row>

                                <div className="label-text text-neutral pl-1 justify-self-end self-center pb-1">
                                    {`M$${ante}`}{" "}
                                </div>

                                {ante > balance && (
                                    <div className="mb-2 mt-2 mr-auto self-center whitespace-nowrap text-xs font-medium tracking-wide">
                                        <span className="mr-2 text-red-500">
                                            Insufficient balance
                                        </span>
                                        <button
                                            className="btn btn-xs btn-primary"
                                            onClick={() => (window.location.href = "/add-funds")}
                                        >
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
                        <GroupSelector
                            selectedGroup={selectedGroup}
                            setSelectedGroup={setSelectedGroup}
                            creator={dummyUser}
                            options={{ showSelector: true, showLabel: true }}
                        ></GroupSelector>
                    </div>
                </div>

                <div className="p-2 overflow-y-auto">
                    {contracts.length > 0 ? (
                        contracts.map((contract) => (
                            <div key={contract.id} className="mb-2">
                                <Col
                                    className={clsx(
                                        "relative gap-3 rounded-lg bg-white py-4 pl-6 pr-5 shadow-md hover:cursor-pointer hover:bg-gray-100",
                                        className
                                    )}
                                >
                                    <Row>
                                        <Col className="relative flex-1 gap-3 pr-1">
                                            <div
                                                className={clsx(
                                                    "peer absolute -left-6 -top-4 -bottom-4 right-0"
                                                )}
                                            ></div>
                                            <AvatarDetails contract={contract} />
                                            <p
                                                className="break-words font-semibold text-indigo-700 peer-hover:underline peer-hover:decoration-indigo-400 peer-hover:decoration-2"
                                                style={{
                                                    /* For iOS safari */ wordBreak: "break-word",
                                                }}
                                            >
                                                {contract.question}
                                            </p>

                                            <MiscDetails contract={contract} />
                                        </Col>
                                        <Col className="m-auto pl-2">
                                            {contract.outcomeType === "BINARY" && (
                                                <BinaryResolutionOrChance
                                                    className="items-center"
                                                    contract={contract}
                                                />
                                            )}
                                            <ProbBar previewProb={contract.probability} />
                                        </Col>
                                    </Row>
                                </Col>
                            </div>
                        ))
                    ) : (
                        <p className="w-full text-center text-gray-400 select-none">No applicable markets in this group</p>
                    )}
                </div>
            </div>
        </div>
    );
};

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
export function MiscDetails(props: {
    contract: LiteMarket;
    showHotVolume?: boolean;
    showTime?: boolean;
    hideGroupLink?: boolean;
}) {
    const { contract, showHotVolume, showTime, hideGroupLink } = props;
    const { volume, volume24Hours, closeTime, isResolved, createdTime, resolutionTime } = contract;

    const isNew = createdTime > Date.now() - DAY_MS && !isResolved;

    return (
        <Row className="items-center gap-3 text-sm text-gray-400">
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
            <p className="break-words hover:underline hover:decoration-indigo-400 hover:decoration-2">
                {creatorName}
            </p>
        </Row>
    );
}

export function ProbBar(props: { previewProb?: number }) {
    const { previewProb } = props;
    const color = "bg-primary";
    const prob = previewProb ?? 0.5;
    return (
        <>
            <div
                className={clsx(
                    "absolute right-0 top-0 w-1.5 rounded-tr-md transition-all",
                    "bg-gray-100"
                )}
                style={{ height: `${100 * (1 - prob)}%` }}
            />
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

export function BinaryResolutionOrChance(props: {
    contract: LiteMarket;
    large?: boolean;
    className?: string;
}) {
    const { contract, large, className } = props;
    const { resolution } = contract;
    // const textColor = `text-${getColor(contract)}`
    const textColor = "text-primary"; //!!!

    return (
        <Col className={clsx(large ? "text-4xl" : "text-3xl", className)}>
            {resolution ? (
                <>
                    <div className={clsx("text-gray-500", large ? "text-xl" : "text-base")}>
                        Resolved
                    </div>
                    <BinaryContractOutcomeLabel contract={contract} resolution={resolution} />
                </>
            ) : (
                <>
                    <div className={textColor}>{(contract.probability * 100).toFixed(0)}%</div>
                    <div className={clsx(textColor, large ? "text-xl" : "text-base")}>chance</div>
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
