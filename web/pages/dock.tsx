import { GroupSelector } from "../components/group-selector";
import { LiteUser } from "common/manifold-defs";
import { Group } from "common/group";
import clsx from "clsx";
import { ConfirmationButton } from "../components/confirmation-button";
import { Title } from "web/components/title";
import { useState } from "react";
import Textarea from "react-expanding-textarea";
import { InfoTooltip } from "web/components/info-tooltip";
import { Row } from "web/components/layout/row";

const dummyUser: LiteUser = { id: "asdasdfgdsef" } as LiteUser;

function PList(props: { name: string | undefined }) {
    if (props.name == "Bugs") {
        return <>Bugs is selected!</>;
    }
    return <></>;
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

    return (
        <div>
            <div className={"p-2"}>
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
                                    <span className="mr-2 text-red-500">Insufficient balance</span>
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
                <PList name={selectedGroup?.name} />
            </div>
        </div>
    );
};
