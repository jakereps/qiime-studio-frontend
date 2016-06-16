import actions from '../actions';
import { makeB64Digest } from '../util/auth';

// global variable to set and clear intervals for scanning for jobs.
let jobInterval;

export const newActiveJob = (workflow, job) => ({
    type: 'NEW_ACTIVE_JOB',
    workflow,
    job
});

export const jobCompleted = (job) => ({
    type: 'JOB_COMPLETED',
    job
});

export const dismissFailed = (id) => ({
    type: 'DISMISS_FAILED_NOTIFICATION',
    id
});

export const pollJobStatus = () => {
    return (dispatch, getState) => {
        const { connection: { uri, availableApis, secretKey } } = getState();
        let url = `http://${uri.split('/')[0]}${availableApis[0]}jobs`;
        fetch(url, {
            method: 'GET'
        })
        .then((response) => {
            if (!response.ok) {
                throw Error(response.statusText);
            }
            return response.json();
        })
        .then((json) => {
            const completed = [];
            if (json.completed.length !== 0) {
                for (const job of json.completed) {
                    if (Object.keys(job).length !== 0) {
                        dispatch(actions.jobCompleted(job));
                        completed.push(job.id);
                    }
                }
            }
            return completed;
        })
        .then((completed) => {
            if (completed.length !== 0) {
                dispatch(actions.refreshArtifacts());
                for (const id of completed) {
                    url = `http://${uri.split('/')[0]}${availableApis[0]}jobs/${id}`;
                    const method = 'DELETE';
                    const requestTime = Date.now();
                    const digest = makeB64Digest(secretKey, method, url, requestTime, undefined);
                    fetch(url, {
                        method,
                        headers: new Headers({
                            Authorization: `HMAC-SHA256 ${digest}`,
                            'Content-Type': 'application/json',
                            'X-QIIME-Timestamp': requestTime
                        }),
                        body: JSON.stringify({})
                    });
                }
            }
        })
        .then(() => {
            const { jobs: { activeJobs } } = getState();
            if (!activeJobs.length) {
                clearInterval(jobInterval);
            }
        });
    };
};

export const startJob = (workflow, data) => {
    const jobData = {};
    for (const [key, value] of data.entries()) {
        jobData[key] = value;
    }

    return (dispatch, getState) => {
        const { connection: { uri, availableApis, secretKey } } = getState();
        const url = `http://${uri.split('/')[0]}${availableApis[0]}${workflow.jobUri}`;
        const method = 'POST';
        const requestTime = Date.now();
        const body = JSON.stringify({
            jobData
        });
        const digest = makeB64Digest(secretKey, method, url, requestTime, body);

        fetch(url, {
            method,
            headers: new Headers({
                Authorization: `HMAC-SHA256 ${digest}`,
                'Content-Type': 'application/json',
                'X-QIIME-Timestamp': requestTime
            }),
            body
        })
        .then((response) => {
            if (!response.ok) {
                throw Error(response.statusText);
            }
            return response.json();
        })
        .then((json) => {
            if (json.success) {
                dispatch(actions.newActiveJob(workflow, json.job));
                jobInterval = setInterval(() => dispatch(actions.pollJobStatus()), 1000);
            }
        });
    };
};

export const clearJobState = () => ({
    type: 'CLEAR_JOB_STATE'
});

export const linkInputArtifact = (input, artifacts) => ({
    type: 'LINK_INPUT_ARTIFACT',
    input,
    artifacts
});

export const fetchInputArtifacts = (workflow) => {
    return (dispatch, getState) => {
        const { connection: { uri, availableApis } } = getState();
        workflow.inputArtifacts.map(input => (
            fetch(`http://${uri.split('/')[0]}${availableApis[0]}${input.uri}`, {
                method: 'GET'
            })
            .then(response => response.json())
            .then(({ input_artifacts }) => dispatch(linkInputArtifact(input, input_artifacts)))
        ));
    };
};
