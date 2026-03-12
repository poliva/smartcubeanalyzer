import React from "react";
import { HelpPanelProps, HelpPanelState } from "../Helpers/Types";
import { Button, Modal } from "react-bootstrap";

export class HelpPanel extends React.Component<HelpPanelProps, HelpPanelState> {
    render() {
        return (
            <Modal
                show={this.props.showHelpPanel}
                onHide={() => { this.props.onCloseHandler() }}
                size="xl"
            >
                <Modal.Header closeButton>
                    <Modal.Title>Cubeast Analyzer</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    Thank you for using Cubeast Analyzer!

                    <br />
                    <br />

                    To use Cubeast Analyzer, start by exporting your solves as CSV files from your training platforms.
                    <br />
                    <a href="https://app.cubeast.com/log/solves"><img className="col-8" src={require("../Assets/CubeastCsv.png")}></img></a>

                    <br />
                    <br />

                    For Cubeast, <a href="https://app.cubeast.com/log/solves">export your solves as a CSV</a> and then <a href="https://app.cubeast.com/exports">download them from Cubeast</a>.
                    <br />
                    <a href="https://app.cubeast.com/exports"><img className="col-8" src={require("../Assets/CubeastDownload.png")}></img></a>

                    <br />
                    <br />

                    For Acubemy, export your solves as a CSV from the session view.

                    Finally upload one or more CSV files (from Cubeast and/or Acubemy) to Cubeast Analyzer and display your combined stats!
                    <br />
                    <img className="col-8" src={require("../Assets/AnalyzerSteps.png")}></img>

                    <br />
                    <br />


                    Make sure to get actionable data out of this tool! To do so, I'd suggest messing around with the tool until you figure out these: <br />
                    1 - What is causing the worst 10% of your solves? <br />
                    2 - What is your slowest step, and what is your slowest case? <br />
                    3 - What makes your good solves different from your bad solves? <br />

                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => { this.props.onCloseHandler() }}>
                        Close
                    </Button>
                </Modal.Footer>
            </Modal>
        )
    }
}
