const fetch = require('node-fetch');
const request = require("request");
const axios = require('axios');
const config = require('../config/config.json');
const fs = require('fs');
const schedule = require('node-schedule');
const mysql = require('mysql2/promise');
const dt = require('date-and-time');
const { assert } = require('console');
const postHeader = {
    headers: {
        Authorization: `Bearer ${config.Mattermost_Bot_Personal_Token}`
    },
}
const makeAction = (name, path, content) => {
    if (content === undefined) content = null;
    return {
        name: name,
        integration: {
            url: `${config.Server_URL}/${path}`,
            context: content
        }
    };
}

const pool = mysql.createPool({
    host: `${config.DB_Host}`,
    port: `${config.DB_Port}`,
    user: `${config.DB_User}`,
    password: `${config.DB_Password}`,
    database: `${config.DB_Database}`
});

let addedUserName;
let attachments;
let userList = [];
let surveyList = [];
let surveyExists = [];
let actions = [
    makeAction("내선번호", 'inLineNum'),
    makeAction("직급", 'position'),
    makeAction("연락처", 'phoneNum'),
    makeAction("생일", 'birthday')
];

module.exports = (app) => {
    app.post('/info', async (req, res) => {
        let reqOption = req.body.text;
        let tempString = reqOption.substring(0, 7);
        if (tempString.indexOf('remove') >= 0) {
            addedUserName = reqOption.replace(/remove /gi, "");
            reqOption = 'remove';
        }
        if (tempString.indexOf('update') >= 0) {
            addedUserName = reqOption.replace(/update /gi, "");
            reqOption = 'update';
        }
        if (tempString.indexOf('user') >= 0) {
            addedUserName = reqOption.replace(/user /gi, "");
            reqOption = 'user';
        }
        if (tempString.indexOf('admin') >= 0) {
            addedUserName = reqOption.replace(/admin /gi, "");
            reqOption = 'admin';
        }
        if (tempString.indexOf('manager') >= 0) {
            addedUserName = reqOption.replace(/manager /gi, "");
            reqOption = 'manager';
        }
        if (tempString.indexOf('survey') >= 0) {
            addedUserName = reqOption.replace(/survey /gi, "");
            reqOption = 'survey';
        }
        switch (reqOption) {
            case "":
                await databaseListOrderBy('position');
                res.send({
                    text: `${userList.join('')}`,
                    response_type: "ephemeral",
                    username: "INFO"
                });
                break;

            case "draw":
                actions = [
                    {
                        name : '전부 추가',
                        integration : {
                            url : ``,
                            context : {
                                drawId : ``
                            }
                        }
                    },
                    {
                        name : '전부 제거',
                        integration : {
                            url : ``,
                            context : {
                                drawId : ``
                            }
                        }
                    }
                ]
                break;

            case "list":
                actions = [
                    makeAction("이름", 'sort_ganada'),
                    makeAction("내선", 'sort_inline'),
                    makeAction("직급", 'sort_position'),
                    makeAction("생일", 'sort_birthday'),
                    makeAction("사물함", 'sort_locker'),
                    makeAction("취소", 'cancel_all'),
                ];
                attachments = [{
                    "title": "SLEXN 인원 조회",
                    "text": `정렬할 기준을 선택해주세요.`,
                    "fields": [],
                    "actions": actions
                }];
                res.send({ username: "INFO", response_type: 'in_channel', attachments });
                break;

            case "version":
                res.send({
                    text: `Bot Version ${config.VERSION}`,
                    response_type: "ephemeral",
                    username: "INFO"
                });
                break;

            case "update":
                const tempUpdateUserRole = await getUserRole(req.body.user_name);
                if (tempUpdateUserRole == 'admin' || tempUpdateUserRole == 'manager') {
                    try {
                        let connection = await pool.getConnection(async conn => conn);
                        try {
                            let [userYesNo] = await connection.query(`SELECT EXISTS (SELECT * FROM userInfo WHERE name='${addedUserName}') AS SUCCESS;`);
                            connection.destroy();
                            if (userYesNo[0].SUCCESS == '0') {
                                res.send({
                                    text: `입력한 User **${addedUserName}**가 Database에 존재하지 않습니다.`,
                                    response_type: "ephemeral",
                                    username: "INFO"
                                });
                                break;
                            } else {
                                const userData = await getUserInfo(addedUserName);
                                if (userData == '201') {
                                    res.send({
                                        text: `Query에서 에러가 발생하였습니다.\n관리자에 문의하시길 바랍니다.`,
                                        response_type: "ephemeral",
                                        username: "INFO"
                                    });
                                    break;
                                } else if (userData == '202') {
                                    res.send({
                                        text: `Database에서 에러가 발생하였습니다.\n관리자에 문의하시길 바랍니다.`,
                                        response_type: "ephemeral",
                                        username: "INFO"
                                    });
                                    break;
                                } else {
                                    res.send();
                                    dialogModify(req.body.trigger_id, req.body.user_name, userData);
                                    break;
                                }
                            }
                        } catch (error) {
                            connection.destroy();
                            res.send({
                                text: `Query에서 에러가 발생하였습니다.\n관리자에 문의하시길 바랍니다.`,
                                response_type: "ephemeral",
                                username: "INFO"
                            });
                            break;
                        }
                    } catch (error) {
                        res.send({
                            text: `Database에서 에러가 발생하였습니다.\n관리자에 문의하시길 바랍니다.`,
                            response_type: "ephemeral",
                            username: "INFO"
                        });
                        break;
                    }
                }
                res.send({
                    text: `현재 User Role : ${tempUpdateUserRole}\nINFO Admin/Manager만 해당 명령어를 사용 가능합니다.`,
                    response_type: "ephemeral",
                    username: "INFO"
                });
                break;

            case "notice":
                actions = [
                    makeAction("작성", 'write_notice'),
                    makeAction("수정", 'update_notice'),
                    makeAction("삭제", 'delete_notice'),
                    makeAction("취소", 'cancel_all'),
                ];
                attachments = [{
                    "title": "공지",
                    "text": `공지를 작성하거나 수정, 삭제할 수 있습니다.`,
                    "fields": [],
                    "actions": actions
                }];
                res.send({ username: "INFO", response_type: 'in_channel', attachments });
                break;


            case "insert":
                const tempAddUserRole = await getUserRole(req.body.user_name);
                if (tempAddUserRole == 'admin' || tempAddUserRole == 'manager') {
                    res.send();
                    dialogNew(req.body.trigger_id, req.body.user_name);
                    break;
                }
                res.send({
                    text: `현재 User Role : ${tempAddUserRole}\nINFO Admin/Manager만 해당 명령어를 사용 가능합니다.`,
                    response_type: "ephemeral",
                    username: "INFO"
                });
                break;

            case "role":
                const tempRole = await getUserRole(req.body.user_name);
                res.send({
                    text: `User ${req.body.user_name}의 Role은 **${tempRole}**입니다.`,
                    response_type: "ephemeral",
                    username: "INFO"
                });
                break;

            case "survey":
                let nowSurvey = await getNowSurvey();
                if (isNaN(Number(addedUserName)) || Number(addedUserName) == 1) {
                    if (nowSurvey[0].length > 1 && typeof nowSurvey[0] == 'object') {
                        if (nowSurvey == 'none') {
                            nowSurvey = [`추가해주세요`, `없음`, `없음`];
                            actions = [
                                makeAction("추가", 'add_survey'),
                                makeAction("취소", 'cancel_all'),
                            ];
                        } else {
                            actions = [
                                makeAction("수정", 'modify_survey'),
                                makeAction("참여", 'vote_survey'),
                                makeAction("결과 조회", 'research_survey'),
                                makeAction("참여여부 조회", 'exists_survey'),
                                makeAction("삭제", 'remove_survey'),
                                makeAction("취소", 'cancel_all'),
                            ];
                        }
                        attachments = [{
                            "title": "Survey 관리",
                            "text": `현재 Survey : ${nowSurvey[0][0]} (객관식)\n추가자 : ${nowSurvey[1]}\n개시일 : ${nowSurvey[2]}`,
                            "fields": [],
                            "actions": actions
                        }];
                        res.send({ username: "INFO", response_type: 'in_channel', attachments });
                    } else {
                        if (nowSurvey == 'none') {
                            nowSurvey = [`추가해주세요`, `없음`, `없음`];
                            actions = [
                                makeAction("추가", 'add_survey'),
                                makeAction("취소", 'cancel_all'),
                            ];
                        } else {
                            actions = [
                                makeAction("수정", 'modify_survey'),
                                makeAction("참여", 'vote_survey'),
                                makeAction("결과 조회", 'research_survey'),
                                makeAction("참여여부 조회", 'exists_survey'),
                                makeAction("삭제", 'remove_survey'),
                                makeAction("취소", 'cancel_all'),
                            ];
                        }
                        attachments = [{
                            "title": "Survey 관리",
                            "text": `현재 Survey : ${nowSurvey[0]}\n추가자 : ${nowSurvey[1]}\n개시일 : ${nowSurvey[2]}`,
                            "fields": [],
                            "actions": actions
                        }];
                        res.send({ username: "INFO", response_type: 'in_channel', attachments });
                    }
                } else {
                    if (Number(addedUserName) > 10) {
                        attachments = [{
                            "title": "객관식 Survey",
                            "text": '등록할 수 있는 객관식 문항은 최소 2개 ~ 최대 10개입니다.',
                            "fields": []
                        }];
                        res.send({ username: "INFO", response_type: 'in_channel', attachments });
                    } else {
                        let nowSurvey = await getNowSurvey();
                        if (nowSurvey == 'none') {
                            nowSurvey = [`추가해주세요`, `없음`, `없음`];
                            actions = [
                                makeAction("추가", 'add_survey_multiple'),
                                makeAction("취소", 'cancel_all'),
                            ];
                            attachments = [{
                                "title": "Survey 관리(객관식 등록)",
                                "text": `현재 Survey : ${nowSurvey[0]}\n추가자 : ${nowSurvey[1]}\n개시일 : ${nowSurvey[2]}`,
                                "fields": [],
                                "actions": actions
                            }];
                            res.send({ username: "INFO", response_type: 'in_channel', attachments });
                        } else {
                            if (typeof nowSurvey[0] == 'string') {
                                attachments = [{
                                    "title": "Survey가 이미 등록됨",
                                    "text": '현재 이미 Survey가 있습니다. `/info Survey` 명령어를 사용하여 Survey에 참여하거나 관리하세요.',
                                    "fields": []
                                }];
                                res.send({ username: "INFO", response_type: 'in_channel', attachments });
                            } else {
                                attachments = [{
                                    "title": "객관식 Survey",
                                    "text": '현재 객관식 Survey가 이미 등록되어있습니다. `/info Survey` 명령어를 사용하여 Survey에 참여하거나 관리하세요.',
                                    "fields": []
                                }];
                                res.send({ username: "INFO", response_type: 'in_channel', attachments });
                            }
                        }
                    }
                }
                break;

            case "remove":
                const tempRemoveUserRole = await getUserRole(req.body.user_name);
                if (tempRemoveUserRole == 'admin' || tempRemoveUserRole == 'manager') {
                    if (addedUserName != 'remove') {
                        actions = [
                            makeAction("취소", 'cancel'),
                            makeAction("제거", 'remove_user'),
                        ];
                        attachments = [{
                            "title": "User 제거",
                            "text": `User Data를 정말로 Database에서 제거하시겠습니까?`,
                            "fields": [],
                            "actions": actions
                        }];
                        res.send({ username: "INFO", response_type: 'in_channel', attachments });
                        break;
                    } else {
                        res.send({
                            text: `추가된 User가 없습니다.`,
                            response_type: "ephemeral",
                            username: "INFO"
                        });
                        break;
                    }
                }
                res.send({
                    text: `현재 User Role : ${tempUserRole}\nINFO Admin/Manager만 해당 명령어를 사용 가능합니다.`,
                    response_type: "ephemeral",
                    username: "INFO"
                });
                break;

            case "admin":
                const tempAdminUserRole = await getUserRole(req.body.user_name);
                if (tempAdminUserRole == 'admin' || tempAdminUserRole == 'manager') {
                    const updateToAdminUserRole = await updateUserRole(addedUserName, reqOption);
                    res.send({
                        text: `${updateToAdminUserRole}`,
                        response_type: "ephemeral",
                        username: "INFO"
                    });
                    break;
                }
                res.send({
                    text: `현재 User Role : ${tempAdminUserRole}\nINFO Admin/Manager만 해당 명령어를 사용 가능합니다.`,
                    response_type: "ephemeral",
                    username: "INFO"
                });
                break;

            case "user":
                const tempSetUserRole = await getUserRole(req.body.user_name);
                if (tempSetUserRole == 'admin' || tempSetUserRole == 'manager') {
                    const updateToUserUserRole = await updateUserRole(addedUserName, reqOption);
                    res.send({
                        text: `${updateToUserUserRole}`,
                        response_type: "ephemeral",
                        username: "INFO"
                    });
                    break;
                }
                res.send({
                    text: `현재 User Role : ${tempSetUserRole}\nINFO Admin/Manager만 해당 명령어를 사용 가능합니다.`,
                    response_type: "ephemeral",
                    username: "INFO"
                });
                break;

            case "manager":
                const tempManagerRole = await getUserRole(req.body.user_name);
                if (tempManagerRole == 'admin' || tempManagerRole == 'manager') {
                    const updateToManagerUserRole = await updateUserRole(addedUserName, reqOption);
                    res.send({
                        text: `${updateToManagerUserRole}`,
                        response_type: "ephemeral",
                        username: "INFO"
                    });
                    break;
                }
                res.send({
                    text: `현재 User Role : ${tempManagerRole}\nINFO Admin/Manager만 해당 명령어를 사용 가능합니다.`,
                    response_type: "ephemeral",
                    username: "INFO"
                });
                break;

            case "covid":
                actions = [
                    makeAction("조회", 'covid_search'),
                ];
                attachments = [{
                    "title": "SLEXN COVID-19 Data Center",
                    "text": `출력 정보를 선택해주세요. 정보는 최근 30건까지 표시됩니다.`,
                    "fields": [],
                    "actions": actions
                }];
                res.send({ username: "INFO", response_type: 'in_channel', attachments });
                break;

            default:
                res.send({
                    text: `명령어가 잘못 입력되었습니다. 명령어를 다시 확인해주세요.`,
                    response_type: "ephemeral",
                    username: "INFO"
                });
                break;
        }

        app.post('/write_notice', async (req, res)=>{
            noticeDialogNew(req.body.trigger_id, req.body.user_name);
            const attachments = [{
                "title": `Notice 작성 Dialog를 오픈합니다.\nNotice 작성이 완료되면 모든 User가 DM을 받습니다.`
            }];
            res.send({ update: { props: { attachments } } });
        });

        app.post('/delete_notice', async (req, res)=>{
            actions = [
                makeAction("취소", 'cancel_all'),
                makeAction("제거", 'remove_notice'),
            ];
            attachments = [{
                "title": "Notice 제거",
                "text": `정말로 게시했던 공지를 지우시겠습니까?`,
                "fields": [],
                "actions": actions
            }];
            res.send({ update: { props: { attachments } } });
        });

        app.post('/remove_notice', async (req, res) => {
            const noticeMessageID = await getNoticeData(req.body.user_name);
            if(noticeMessageID[1] == '1' || noticeMessageID == 'none'){
                const attachments = [{
                    "title": `작성했던 공지가 없습니다.`
                }];
                res.send({ update: { props: { attachments } } });
            } else {
                removeNoticeUserLastWrite(req.body.trigger_id, req.body.user_name, noticeMessageID[0]);
                const attachments = [{
                    "title": `작성한 공지를 제거하였습니다.`
                }];
                res.send({ update: { props: { attachments } } });
            }
        });

        app.post('/update_notice', async (req, res)=>{
            const noticeMessageIDS = await getNoticeData(req.body.user_name);
            if(noticeMessageIDS[1] == '1' || noticeMessageIDS == 'none'){
                const attachments = [{
                    "title": `작성했던 공지가 없습니다.`
                }];
                res.send({ update: { props: { attachments } } });
            } else {
                noticeDialogModify(req.body.trigger_id, req.body.user_name, noticeMessageIDS[0]);
                const attachments = [{
                    "title": `Notice 수정 Dialog를 오픈합니다.\n수정이 완료되면 모든 User가 DM을 받습니다.`
                }];
                res.send({ update: { props: { attachments } } });
                }
        });

        app.post('/sort_ganada', async (req, res) => {
            await databaseListOrderBy('name');
            res.send({
                update: { message: `${userList.join('')}`, props: {} }
            });
        });

        app.post('/sort_position', async (req, res) => {
            await databaseListOrderBy('position');
            res.send({
                update: { message: `${userList.join('')}`, props: {} }
            });
        });

        app.post('/sort_inline', async (req, res) => {
            await databaseListOrderBy('inLineNum');
            res.send({
                update: { message: `${userList.join('')}`, props: {} }
            });
        });

        app.post('/sort_birthday', async (req, res) => {
            await databaseListOrderBy('date');
            res.send({
                update: { message: `${userList.join('')}`, props: {} }
            });
        });

        app.post('/sort_locker', async (req, res) => {
            await databaseListOrderBy('Locker');
            res.send({
                update: { message: `${userList.join('')}`, props: {} }
            });
        });

        app.post('/covid_search', async (req, res) => {
            await covidDataList();
            res.send({
                update: { message: `${userList.join('')}`, props: {} }
            });
        });

        app.post('/notice_to_channel', (req, res) => {
            res.send();
            let tempChannelName;
            //if (req.body.submission.textprops_notice.indexOf('@all') >= 0 || req.body.submission.textprops_notice.indexOf('@channel') >= 0) {
                if (req.body.submission.textprops_channel == config.general_Channel_ID) {
                    tempChannelName = '00.General(일반업무)';
                } else if (req.body.submission.textprops_channel == config.sales_Channel_ID) {
                    tempChannelName = '01.Sales(영업관리)';
                } else if (req.body.submission.textprops_channel == config.marketing_Channel_ID) {
                    tempChannelName = '02.Marketing(마케팅)';
                } else if (req.body.submission.textprops_channel == config.engineering_Channel_ID) {
                    tempChannelName = '03.Engineering(기술)';
                } else if (req.body.submission.textprops_channel == config.customer_Channel_ID) {
                    tempChannelName = '04.Customer(사용자)';
                } else if (req.body.submission.textprops_channel == config.support_Channel_ID) {
                    tempChannelName = '05.Support(지원)';
                } else if (req.body.submission.textprops_channel == config.meetings_Channel_ID) {
                    tempChannelName = '06.Meetings(회의실)';
                } else if (req.body.submission.textprops_channel == config.partners_Channel_ID) {
                    tempChannelName = '20.Partners(파트너사)';
                } else if (req.body.submission.textprops_channel == config.openspace_Channel_ID) {
                    tempChannelName = '91.OpenSpace(회관)';
                } else if (req.body.submission.textprops_channel == config.openplay_Channel_ID) {
                    tempChannelName = '92.OpenPlay(추천)';
                }  else if (req.body.submission.textprops_channel == config.openshow_Channel_ID) {
                    tempChannelName = '93.OpenShow(TV쇼)';
                } else if (req.body.submission.textprops_channel == config.private_general_Channel_ID) {
                    tempChannelName = '01.General(총괄팀)';
                } else if (req.body.submission.textprops_channel == config.Channel_ID) {
                    tempChannelName = '개발용 : 특급 오후 6시 30분행 열차 채널';
                }
                postData = {
                    channel_id: `${req.body.submission.textprops_channel}`,
                    message: `${req.body.submission.textprops_notice}\n\n_@${req.body.submission.textprops_name}님이 작성함._`
                };

                axios.post(config.Finger_Chat_API_URL, postData, postHeader
                ).then(res => {
                    inputNoticeData(res.data.id, req.body.submission.textprops_name_real);
                    sendDMNotice(`[${tempChannelName} Channel](${config.Mattermost_Server_URL}/argp/pl/${res.data.id})에 공지사항이 추가되었습니다.`);
                }).catch(error => {
                    console.log(error);
                });
            /* } else {
                postData = {
                    channel_id: `${req.body.submission.textprops_channel}`,
                    message: `${req.body.submission.textprops_notice}\n\n_@${req.body.submission.textprops_name}님이 작성함._`
                };

                axios.post(config.Finger_Chat_API_URL, postData, postHeader
                ).catch(error => {
                    console.log(error);
                });
            } */
        });

        app.post('/notice_edit_to_channel', (req, res) => {
            res.send();
            let tempChannelName;
                /* if (req.body.submission.textprops_channel == config.general_Channel_ID) {
                    tempChannelName = '00.General(일반업무)';
                } else if (req.body.submission.textprops_channel == config.sales_Channel_ID) {
                    tempChannelName = '01.Sales(영업관리)';
                } else if (req.body.submission.textprops_channel == config.marketing_Channel_ID) {
                    tempChannelName = '02.Marketing(마케팅)';
                } else if (req.body.submission.textprops_channel == config.engineering_Channel_ID) {
                    tempChannelName = '03.Engineering(기술)';
                } else if (req.body.submission.textprops_channel == config.customer_Channel_ID) {
                    tempChannelName = '04.Customer(사용자)';
                } else if (req.body.submission.textprops_channel == config.support_Channel_ID) {
                    tempChannelName = '05.Support(지원)';
                } else if (req.body.submission.textprops_channel == config.meetings_Channel_ID) {
                    tempChannelName = '06.Meetings(회의실)';
                } else if (req.body.submission.textprops_channel == config.partners_Channel_ID) {
                    tempChannelName = '20.Partners(파트너사)';
                } else if (req.body.submission.textprops_channel == config.openspace_Channel_ID) {
                    tempChannelName = '91.OpenSpace(회관)';
                } else if (req.body.submission.textprops_channel == config.openplay_Channel_ID) {
                    tempChannelName = '92.OpenPlay(추천)';
                }  else if (req.body.submission.textprops_channel == config.openshow_Channel_ID) {
                    tempChannelName = '93.OpenShow(TV쇼)';
                } else if (req.body.submission.textprops_channel == config.private_general_Channel_ID) {
                    tempChannelName = '01.General(총괄팀)';
                }else if (req.body.submission.textprops_channel == config.Channel_ID) {
                    tempChannelName = '개발용 : 특급 오후 6시 30분행 열차 채널';
                } */
                postData = {
                    id: `${req.body.submission.textprops_noticeID}`,
                    message: `${req.body.submission.textprops_notice}`
                };

                axios.put(`${config.Finger_Chat_API_URL}/${req.body.submission.textprops_noticeID}`, postData, postHeader
                ).then(res => {
                    //inputNoticeData(res.data.id, req.body.submission.textprops_username);
                    //sendDMNotice(`[${tempChannelName} Channel](${config.Mattermost_Server_URL}/argp/pl/${res.data.id})에 공지사항이 수정되었습니다.`);
                }).catch(error => {
                    console.log(error);
                });
        });

        app.post('/exists_survey', async (req, res) => {
            const checkErrorCode = await getSurveyExists();
            if (checkErrorCode == 'none') {
                surveyExists = ['참여된 내용이 없습니다.'];
            } else if (checkErrorCode == 'error') {
                surveyExists = ['Error가 발생하였습니다. 관리자에게 문의하시길 바랍니다.'];
            } else if (checkErrorCode == 'queryError') {
                surveyExists = ['queryError가 발생하였습니다. 관리자에게 문의하시길 바랍니다.'];
            } else if (checkErrorCode == 'DBerror') {
                surveyExists = ['DBerror가 발생하였습니다. 관리자에게 문의하시길 바랍니다.'];
            }
            res.send({
                update: { message: `${surveyExists.join('')}`, props: {} }
            });
        });

        app.post('/research_survey', async (req, res) => {
            const checkErrorCode = await getSurveyResult();
            if (checkErrorCode == 'none') {
                surveyList = ['참여된 내용이 없습니다.'];
            } else if (checkErrorCode == 'error') {
                surveyExists = ['Error가 발생하였습니다. 관리자에게 문의하시길 바랍니다.'];
            } else if (checkErrorCode == 'queryError') {
                surveyExists = ['queryError가 발생하였습니다. 관리자에게 문의하시길 바랍니다.'];
            } else if (checkErrorCode == 'DBerror') {
                surveyExists = ['DBerror가 발생하였습니다. 관리자에게 문의하시길 바랍니다.'];
            }
            res.send({
                update: { message: `${surveyList.join('')}`, props: {} }
            });
        });

        app.post('/modify_survey', async (req, res) => {
            const tempUserSurvey = await getUserSurveyContents(req.body.user_name);
            if (tempUserSurvey == 'none') {
                const attachments = [{
                    "title": `참여했던 내용이 없습니다.`
                }];
                res.send({ update: { props: { attachments } } });
            } else if (tempUserSurvey == 'error') {
                const attachments = [{
                    "title": `Error가 발생하였습니다. 관리자에게 문의하시길 바랍니다.`
                }];
                res.send({ update: { props: { attachments } } });
            } else if (tempUserSurvey == 'queryError') {
                const attachments = [{
                    "title": `queryError가 발생하였습니다. 관리자에게 문의하시길 바랍니다.`
                }];
                res.send({ update: { props: { attachments } } });
            } else if (tempUserSurvey == 'DBerror') {
                const attachments = [{
                    "title": `DBerror가 발생하였습니다. 관리자에게 문의하시길 바랍니다.`
                }];
                res.send({ update: { props: { attachments } } });
            } else {
                dialogSurveyModify(req.body.trigger_id, req.body.user_name, tempUserSurvey[0], tempUserSurvey[1], tempUserSurvey[2]);
                const attachments = [{
                    "title": `Survey 참여 Dialog를 오픈합니다.\n내용 추가가 완료되면 해당 Bot에게 DM을 받습니다.`
                }];
                res.send({ update: { props: { attachments } } });
            }
        });

        app.post('/vote_survey', async (req, res) => {
            const userSurveyExists = await getUserSurveyExists(req.body.user_name);
            if (userSurveyExists == 'has') {
                const attachments = [{
                    "title": `이미 참여하셨습니다.`
                }];
                res.send({ update: { props: { attachments } } });
            } else if (userSurveyExists == 'error') {
                const attachments = [{
                    "title": `Error가 발생하였습니다. 관리자에게 문의하시길 바랍니다.`
                }];
                res.send({ update: { props: { attachments } } });
            } else if (userSurveyExists == 'queryError') {
                const attachments = [{
                    "title": `queryError가 발생하였습니다. 관리자에게 문의하시길 바랍니다.`
                }];
                res.send({ update: { props: { attachments } } });
            } else if (userSurveyExists == 'DBerror') {
                const attachments = [{
                    "title": `DBerror가 발생하였습니다. 관리자에게 문의하시길 바랍니다.`
                }];
                res.send({ update: { props: { attachments } } });
            } else {
                const tempNowSurvey = await getNowSurvey();
                dialogSurveyVote(req.body.trigger_id, req.body.user_name, tempNowSurvey[0]);
                const attachments = [{
                    "title": `Survey 참여 Dialog를 오픈합니다.\n내용 추가가 완료되면 해당 Bot에게 DM을 받습니다.`
                }];
                res.send({ update: { props: { attachments } } });
            }
        });

        app.post('/cancel', (req, res) => {
            const attachments = [{
                "title": "User 제거를 취소하였습니다."
            }];
            res.send({ update: { props: { attachments } } });
        });


        app.post('/cancel_all', (req, res) => {
            const attachments = [{
                "title": "취소하였습니다."
            }];
            res.send({ update: { props: { attachments } } });
        });

        app.post('/add_survey_multiple', (req, res) => {
            dialogMultipleSurveyNew(req.body.trigger_id, req.body.user_name, addedUserName);
            const attachments = [{
                "title": `객관식 Survey 추가 Dialog를 오픈합니다.\n내용 추가가 완료되면 해당 Bot에게 DM을 받습니다.`
            }];
            res.send({ update: { props: { attachments } } });
        });

        app.post('/add_survey', (req, res) => {
            dialogSurveyNew(req.body.trigger_id, req.body.user_name);
            const attachments = [{
                "title": `Survey 추가 Dialog를 오픈합니다.\n내용 추가가 완료되면 해당 Bot에게 DM을 받습니다.`
            }];
            res.send({ update: { props: { attachments } } });
        });

        app.post('/remove_survey_2', (req, res) => {
            deleteAllSurvey();
            const attachments = [{
                "title": `모든 Survey Data를 제거하였습니다.`
            }];
            res.send({ update: { props: { attachments } } });
        });

        app.post('/remove_survey', async (req, res) => {
            const tempRemoveManagerRole = await getUserRole(req.body.user_name);
            if (tempRemoveManagerRole == 'admin' || tempRemoveManagerRole == 'manager') {
                let nowSurvey = await getNowSurvey();
                if (typeof nowSurvey[0] == 'object') {
                    actions = [
                        makeAction("취소", 'cancel_all'),
                        makeAction("삭제", 'remove_survey_2'),
                    ];
                    attachments = [{
                        "title": "Survey 삭제",
                        "text": `현재 등록되어있는 Survey를 삭제할까요?\n현재 Survey : ${nowSurvey[0][0]}(객관식)`,
                        "fields": [],
                        "actions": actions
                    }];
                    res.send({ update: { props: { attachments } } });
                } else {
                    actions = [
                        makeAction("취소", 'cancel_all'),
                        makeAction("삭제", 'remove_survey_2'),
                    ];
                    attachments = [{
                        "title": "Survey 삭제",
                        "text": `현재 등록되어있는 Survey를 삭제할까요?\n현재 Survey : ${nowSurvey[0]}`,
                        "fields": [],
                        "actions": actions
                    }];
                    res.send({ update: { props: { attachments } } });
                }
            } else {
                const attachments = [{
                    "title": `권한이 Admin/Manager인 User만 제거할 수 있습니다.`
                }];
                res.send({ update: { props: { attachments } } });
            }
        });

        app.post('/remove_user', async (req, res) => {
            try {
                let connection = await pool.getConnection(async conn => conn);
                try {
                    let [userYesNo] = await connection.query(`SELECT EXISTS (SELECT * FROM userInfo WHERE name='${addedUserName}') AS SUCCESS;`);
                    connection.destroy();
                    if (userYesNo[0].SUCCESS == '0') {
                        const attachments = [{
                            "title": `해당 User **${addedUserName}**이(가) 존재하지 않습니다.`
                        }];
                        res.send({ update: { props: { attachments } } });
                    } else {
                        const userRemoveResult = await removeUser(addedUserName);
                        const attachments = [{
                            "title": `${userRemoveResult}`
                        }];
                        res.send({ update: { props: { attachments } } });
                    }
                } catch (error) {
                    message = `Query 에서 에러가 발생하였습니다. 관리자에게 문의하세요.`;
                    connection.destroy();
                }
            } catch (error) {
                message = `DB에서 에러가 발생하였습니다. 관리자에게 문의하세요.`;
            }
        });
    });

    app.post('/creat2', async (req, res) => {
        dialogNew(req.body.trigger_id, req.body.user_name);
        const attachments = [{
            "title": `생성중입니다.\n완료되면 해당Bot에게 DM을 받습니다.`
        }];
        res.send({ update: { props: { attachments } } });
    });

    app.post('/modify2', async (req, res) => {
        dialogModify(req.body.trigger_id, req.body.user_name);
        const attachments = [{
            "title": `내용 추가 중입니다.\n내용 추가가 완료되면 해당 Bot에게 DM을 받습니다.`
        }];
        res.send({ update: { props: { attachments } } });
    });

    app.post('/submit_create', async (req, res) => {
        res.send();
        await axios({
            method: 'GET',
            url: `${config.Mattermost_Server_URL}/api/v4/users/username/${req.body.submission.textprops_mattermost_name}`,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.Mattermost_Bot_Personal_Token}`,
                'Accept-Language': 'ko/KR'
            },
        }).then(async (res) => {
            try {
                let connection = await pool.getConnection(async conn => conn);
                try {
                    let [userYesNo] = await connection.query(`SELECT EXISTS (SELECT * FROM userInfo WHERE name='${req.body.submission.textprops_name}') AS SUCCESS;`);
                    connection.release();
                    if (userYesNo[0].SUCCESS == '0') {
                        try {
                            let [results] = await connection.query(`INSERT INTO userInfo(name, inLineNum, position, phoneNum, birthday, botUsageRole, id, department, UserID, Locker)VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [`${req.body.submission.textprops_name}`, `${req.body.submission.textprops_inLineNum}`, `${req.body.submission.textprops_position}`, `${req.body.submission.textprops_phoneNum}`, `9999${req.body.submission.textprops_birthday.replace(/[^0-9]/g, "")}`, 'user', `${req.body.submission.textprops_mattermost_name}`, `${req.body.submission.textprops_department}`, `${res.data.id}`, `${req.body.submission.textprops_locker}`]);
                            connection.destroy();
                            sendDM(req.body.user_id, `입력하신 정보로 Database에 User를 추가하였습니다.`);
                        } catch (error) {
                            connection.destroy();
                            sendDM(req.body.user_id, `Query에 문제가 발생했습니다. 관리자에게 문의하시길 바랍니다.\n${error}`);
                        }
                    } else {
                        try {
                            connection.destroy();
                            sendDM(req.body.user_id, `해당 User가 이미 Database에 등록되어있습니다.`);
                        } catch (error) {
                            connection.destroy();
                            sendDM(req.body.user_id, `Query에 문제가 발생했습니다. 관리자에게 문의하시길 바랍니다.\n${error}`);
                        }
                    }
                } catch (error) {
                    sendDM(req.body.user_id, `Query에 문제가 발생했습니다. 관리자에게 문의하시길 바랍니다.\n${error}`);
                    connection.destroy();
                }
            } catch (error) {
                sendDM(req.body.user_id, `Database에 문제가 발생했습니다. 관리자에게 문의하시길 바랍니다.\n${error}`);
            }
        }).catch((error) => {
            sendDM(req.body.user_id, `에러가 발생하였습니다. Mattermost UserID가 잘못되었을 수 있습니다.\n${error}`);
        });
    });

    app.post('/submit_modify', async (req, res) => {
        res.send();
        try {
            let connection = await pool.getConnection(async conn => conn);
            try {
                let [results] = await connection.query(`UPDATE userInfo SET name='${req.body.submission.textprops_name}', inLineNum='${req.body.submission.textprops_inLineNum}', position='${req.body.submission.textprops_position}', phoneNum='${req.body.submission.textprops_phoneNum}', birthday='9999${req.body.submission.textprops_birthday}', id='${req.body.submission.textprops_mattermost_name}', department='${req.body.submission.textprops_department}', locker='${req.body.submission.textprops_locker}' WHERE name = '${req.body.submission.textprops_name}'`);
                connection.destroy();
                sendDM(req.body.user_id, `해당 User의 정보를 Update하였습니다.`);
            } catch (error) {
                connection.destroy();
                sendDM(req.body.user_id, `Query에 문제가 발생했습니다. 관리자에게 문의하시길 바랍니다.\n${error}`);
            }
        } catch (error) {
            sendDM(req.body.user_id, `Database에 문제가 발생했습니다. 관리자에게 문의하시길 바랍니다.\n${error}`);
        }
    });

    app.post('/submit_survey_update', async (req, res) => {
        res.send();
        let date = new Date();
        let tempMonth = date.getMonth() + 1;
        let tempDate = date.getDate();
        if (1 >= tempMonth.toString().length) {
            tempMonth = `0${tempMonth}`;
        }
        if (1 >= tempDate.toString().length) {
            tempDate = `0${tempDate}`;
        }
        try {
            let connection = await pool.getConnection(async conn => conn);
            try {
                let [results] = await connection.query(`UPDATE surveyInfo SET contents = '${req.body.submission.textprops_survey}', date = '${req.body.submission.textprops_date}' WHERE userName = '${req.body.submission.textprops_name}' AND sort = '1';`);
                connection.destroy();
                sendDM(req.body.user_id, `내용을 수정하였습니다.`);
            } catch (error) {
                connection.destroy();
                sendDM(req.body.user_id, `Query에 문제가 발생했습니다. 관리자에게 문의하시길 바랍니다.\n${error}`);
            }
        } catch (error) {
            sendDM(req.body.user_id, `Database에 문제가 발생했습니다. 관리자에게 문의하시길 바랍니다.\n${error}`);
        }
    });


    app.post('/survey_vote', async (req, res) => {
        res.send();
        let date = new Date();
        let tempMonth = date.getMonth() + 1;
        let tempDate = date.getDate();
        if (1 >= tempMonth.toString().length) {
            tempMonth = `0${tempMonth}`;
        }
        if (1 >= tempDate.toString().length) {
            tempDate = `0${tempDate}`;
        }
        try {
            let connection = await pool.getConnection(async conn => conn);
            try {
                let [results] = await connection.query(`INSERT INTO surveyInfo(userName, contents, date, sort)VALUES(?, ?, ?, ?)`, [`${req.body.submission.textprops_name}`, `${req.body.submission.textprops_survey}`, `${date.getFullYear()}-${tempMonth}-${tempDate}`, `1`]);
                connection.destroy();
                sendDM(req.body.user_id, `참여를 완료하였습니다.`);
            } catch (error) {
                sendDM(req.body.user_id, `Query에 문제가 발생했습니다. 관리자에게 문의하시길 바랍니다.\n${error}`);
            }
        } catch (error) {
            sendDM(req.body.user_id, `Database에 문제가 발생했습니다. 관리자에게 문의하시길 바랍니다.\n${error}`);
        }
    });

    app.post('/multiple_survey_create', async (req, res) => {
        //console.log(Object.keys(req.body.submission));
        res.send();
        let date = new Date();
        let tempMonth = date.getMonth() + 1;
        let tempDate = date.getDate();
        if (1 >= tempMonth.toString().length) {
            tempMonth = `0${tempMonth}`;
        }
        if (1 >= tempDate.toString().length) {
            tempDate = `0${tempDate}`;
        }
        try {
            let connection = await pool.getConnection(async conn => conn);
            try {
                let [results] = await connection.query(`INSERT INTO surveyInfo(userName, contents, date, sort)VALUES(?, ?, ?, ?)`, [`${req.body.submission.textprops_name}`, `${req.body.submission.textprops_survey}`, `${date.getFullYear()}-${tempMonth}-${tempDate}`, `0`]);
                for (let i = 0; i < Object.keys(req.body.submission).length - 2; i++) {
                    let [results1] = await connection.query(`INSERT INTO surveyInfo(userName, contents, date, sort)VALUES(?, ?, ?, ?)`, [`${req.body.submission.textprops_name}`, `${Object.values(req.body.submission)[i]}`, `${date.getFullYear()}-${tempMonth}-${tempDate}`, `0`]);
                }
                connection.destroy();
                sendDM(req.body.user_id, `해당 Survey를 등록하였습니다.`);
                sendDMSurvey();
            } catch (error) {
                connection.destroy();
                sendDM(req.body.user_id, `Query에 문제가 발생했습니다. 관리자에게 문의하시길 바랍니다.\n${error}`);
            }
        } catch (error) {
            sendDM(req.body.user_id, `Database에 문제가 발생했습니다. 관리자에게 문의하시길 바랍니다.\n${error}`);
        }
    });

    app.post('/survey_create', async (req, res) => {
        res.send();
        let date = new Date();
        let tempMonth = date.getMonth() + 1;
        let tempDate = date.getDate();
        if (1 >= tempMonth.toString().length) {
            tempMonth = `0${tempMonth}`;
        }
        if (1 >= tempDate.toString().length) {
            tempDate = `0${tempDate}`;
        }
        try {
            let connection = await pool.getConnection(async conn => conn);
            try {
                let [results] = await connection.query(`INSERT INTO surveyInfo(userName, contents, date, sort)VALUES(?, ?, ?, ?)`, [`${req.body.submission.textprops_name}`, `${req.body.submission.textprops_survey}`, `${date.getFullYear()}-${tempMonth}-${tempDate}`, `0`]);
                connection.destroy();
                sendDM(req.body.user_id, `해당 Survey를 등록하였습니다.`);
                sendDMSurvey();
            } catch (error) {
                connection.destroy();
                sendDM(req.body.user_id, `Query에 문제가 발생했습니다. 관리자에게 문의하시길 바랍니다.\n${error}`);
            }
        } catch (error) {
            sendDM(req.body.user_id, `Database에 문제가 발생했습니다. 관리자에게 문의하시길 바랍니다.\n${error}`);
        }
    });

    const getNoticeData = async (mattermostID) => {
        try {
            let connection = await pool.getConnection(async conn => conn);
            try {
                let [userYesNo] = await connection.query(`SELECT EXISTS (SELECT * FROM noticeData WHERE mattermostID='${mattermostID}') AS SUCCESS;`);
                connection.release();
                if (userYesNo[0].SUCCESS == '0') {
                    connection.destroy();
                    return `none`;
                } else {
                    try {
                        let [results] = await connection.query(`SELECT messageID, deleteYN FROM noticeData WHERE mattermostID = '${mattermostID}';`);
                        connection.destroy();
                        return [`${results[0].messageID}`, `${results[0].deleteYN}`];
                    } catch (error) {
                        connection.destroy();
                        return `error`;
                    }
                }
            } catch (error) {
                connection.destroy();
                return `error`;
            }
        } catch (error) {
            return `error`;
        }
    }

    const inputNoticeData = async (messageID, mattermostID) => {
        try {
            let connection = await pool.getConnection(async conn => conn);
            try {
                let [userYesNo] = await connection.query(`SELECT EXISTS (SELECT * FROM noticeData WHERE mattermostID='${mattermostID}') AS SUCCESS;`);
                connection.release();
                if (userYesNo[0].SUCCESS == '0') {
                    try {
                        let [results] = await connection.query(`INSERT INTO noticeData(mattermostID, messageID, deleteYN)VALUES(?, ?, ?)`, [`${mattermostID}`, `${messageID}`, '0']);
                        connection.destroy();
                    } catch (error) {
                        console.log(error);
                    }
                } else {
                    try {
                        let [results] = await connection.query(`UPDATE noticeData SET mattermostID = '${mattermostID}', messageID = '${messageID}', deleteYN = '0' WHERE mattermostID='${mattermostID}'`);
                        connection.destroy();
                    } catch (error) {
                        console.log(error);
                    }
                }
            } catch (error) {
                console.log(error);
                connection.destroy();
            }
        } catch (error) {
            console.log(error);
        }
    }

    const sendDMSurvey = async () => {
        try {
            let connection = await pool.getConnection(async conn => conn);
            try {
                let [userYesNo] = await connection.query(`SELECT EXISTS (SELECT * FROM surveyInfo) AS SUCCESS;`);
                connection.release();
                if (userYesNo[0].SUCCESS == '0') {
                    connection.destroy();
                    return `none`;
                } else {
                    try {
                        let [results] = await connection.query(`SELECT * FROM surveyInfo LIMIT 1;`);
                        connection.release();
                        let dmPost;
                        let attachments;
                        actions = [
                            makeAction("참가", 'vote_survey')
                        ];
                        attachments = [{
                            "title": "Survey 등록됨",
                            "text": `${results[0].contents}`,
                            "fields": [],
                            "actions": actions
                        }];
                        try {
                            let [results] = await connection.query(`SELECT userID FROM dataInfo;`);
                            connection.destroy();
                            for (let i = 0; i < results.length; i++) {
                                dmPost = [
                                    `${results[i].userID}`,
                                    `${config.Bot_User_Id}`
                                ]
                                axios.post(config.Direct_URL, dmPost, postHeader)
                                    .then((res) => {
                                        dmPost = {
                                            channel_id: `${res.data.id}`,
                                            props: { attachments }
                                        }
                                        axios.post(config.Finger_Chat_API_URL, dmPost, postHeader
                                        ).catch(error => {
                                            console.log(error);
                                        });
                                    })
                                    .catch(error => {
                                        console.log(error);
                                    });
                            }
                        } catch (error) {
                            connection.destroy();
                        }
                    } catch (error) {
                        connection.destroy();
                    }
                }
            } catch (error) {
                connection.destroy();
            }
        } catch (error) {
            console.log(error);
        }
    }

    const sendDMNotice = async (message) => {
        try {
            let connection = await pool.getConnection(async conn => conn);
            try {
                let [results] = await connection.query(`SELECT userID FROM dataInfo;`);
                connection.destroy();
                let attachments;
                attachments = [{
                    "title": "Notice 등록됨",
                    "text": `${message}`,
                    "fields": [],
                }];
                for (let i = 0; i < results.length; i++) {
                    dmPost = [
                        `${results[i].userID}`,
                        `${config.Bot_User_Id}`
                    ]
                    axios.post(config.Direct_URL, dmPost, postHeader)
                        .then((res) => {
                            dmPost = {
                                channel_id: `${res.data.id}`,
                                props: { attachments }
                            }
                            axios.post(config.Finger_Chat_API_URL, dmPost, postHeader
                            ).catch(error => {
                                console.log(error);
                            });
                        })
                        .catch(error => {
                            console.log(error);
                        });
                }
            } catch (error) {
                connection.destroy();
            }
        } catch (error) {
            connection.destroy();
        }
    }

    const sendDM = (userId, message) => {
        let dmPost;
        dmPost = [
            `${userId}`,
            `${config.Bot_User_Id}`
        ]
        axios.post(config.Direct_URL, dmPost, postHeader)
            .then((res) => {
                dmPost = {
                    channel_id: `${res.data.id}`,
                    message: `${message}`
                }
                axios.post(config.Finger_Chat_API_URL, dmPost, postHeader
                ).catch(error => {
                    console.log(error);
                });
            })
            .catch(error => {
                console.log(error);
            });
    }

    const dialogMultipleSurveyNew = async (id, username, arrayCount) => {
        let tempElements = [];
        tempElements[0] = { display_name: '작성자(절대 수정하지 마세요.)', name: 'textprops_name', type: 'text', default: `${username}`, optional: false };
        tempElements[1] = { display_name: '주제', name: 'textprops_survey', type: 'text', optional: false };
        for (let i = 0; i < Number(arrayCount); i++) {
            tempElements[i + 2] = { display_name: `${i + 1}번째 보기`, name: `textprops_${i + 1}`, type: 'text', optional: false };
        }
        let dialogNewPost;
        dialogNewPost = {
            trigger_id: id,
            url: `${config.Server_URL}/multiple_survey_create`,
            dialog: {
                title: '객관식 Survey 추가',
                elements: tempElements,
                submit_label: '추가',
                notify_on_cancel: false,
            }
        }
        axios.post(config.Finger_Chat_API_URL2, dialogNewPost, postHeader
        ).catch(error => {
            sendDM(config.FingerChat_Error_Notice_Member_ID, `API 에러가 발생하였습니다.\n${error}`);
        });
    }

    const dialogSurveyNew = async (id, username) => {
        let dialogNewPost;
        dialogNewPost = {
            trigger_id: id,
            url: `${config.Server_URL}/survey_create`,
            dialog: {
                title: 'Survey 추가',
                elements: [
                    {
                        display_name: '작성자(절대 수정하지 마세요.)',
                        name: 'textprops_name',
                        type: 'text',
                        default: `${username}`,
                        optional: false,
                    },
                    {
                        display_name: `추가할 Survey 내용`,
                        name: 'textprops_survey',
                        type: 'text',
                        optional: false,
                    }
                ],
                submit_label: '추가',
                notify_on_cancel: false,
            }
        }
        axios.post(config.Finger_Chat_API_URL2, dialogNewPost, postHeader
        ).catch(error => {
            sendDM(config.FingerChat_Error_Notice_Member_ID, `API 에러가 발생하였습니다.\n${error}`);
        });
    }

    const dialogSurveyVote = async (id, username, surveyData) => {
        let dialogNewPost;
        let tempElements = [];
        if (typeof surveyData == 'object') {
            for (let i = 0; i < surveyData.length - 1; i++) {
                tempElements[i] = { text: `${surveyData[i + 1]}`, value: `${surveyData[i + 1]}` };
            }
            dialogNewPost = {
                trigger_id: id,
                url: `${config.Server_URL}/survey_vote`,
                dialog: {
                    title: 'Survey 참여',
                    elements: [
                        {
                            display_name: '참여자(절대 수정하지 마세요.)',
                            name: 'textprops_name',
                            type: 'text',
                            default: `${username}`,
                            optional: false,
                        },
                        {
                            display_name: `${surveyData[0]}`,
                            name: "textprops_survey",
                            type: "select",
                            optional: false,
                            options: tempElements
                        }
                    ],
                    submit_label: '참여',
                    notify_on_cancel: false,
                }
            }
        } else {
            dialogNewPost = {
                trigger_id: id,
                url: `${config.Server_URL}/survey_vote`,
                dialog: {
                    title: 'Survey 참여',
                    elements: [
                        {
                            display_name: '참여자(절대 수정하지 마세요.)',
                            name: 'textprops_name',
                            type: 'text',
                            default: `${username}`,
                            optional: false,
                        },
                        {
                            display_name: `${surveyData}`,
                            name: 'textprops_survey',
                            type: 'text',
                            optional: false,
                        }
                    ],
                    submit_label: '참여',
                    notify_on_cancel: false,
                }
            }
        }
        axios.post(config.Finger_Chat_API_URL2, dialogNewPost, postHeader
        ).catch(error => {
            sendDM(config.FingerChat_Error_Notice_Member_ID, `API 에러가 발생하였습니다.\n${error}`);
        });
    }

    const removeNoticeUserLastWrite = async (id, username, messageID) => {
        axios.delete(`${config.Finger_Chat_API_URL}/${messageID}`, postHeader
            ).then(async res => {
                try {
                    let connection = await pool.getConnection(async conn => conn);
                    try {
                        let [results] = await connection.query(`UPDATE noticeData SET deleteYN = '1' WHERE mattermostID = '${username}'`);
                        connection.destroy();
                    } catch (error) {
                        connection.destroy();
                        console.log(error);
                    }
                } catch (error) {
                    connection.destroy();
                    console.log(error);
                }
            }) .catch(error => {
                sendDM(config.FingerChat_Error_Notice_Member_ID, `API 에러가 발생하였습니다.\n${error}`);
            });
    }

    const noticeDialogNew = async (id, username) => {
        let dialogNewPost;
        dialogNewPost = {
            trigger_id: id,
            url: `${config.Server_URL}/notice_to_channel`,
            dialog: {
                title: 'Notice 하기',
                elements: [
                    {
                        display_name: '공지에 표시할 작성자',
                        name: 'textprops_name',
                        type: 'text',
                        default: `${username}`,
                        optional: false,
                    },
                    {
                        display_name: "Notice할 Channel",
                        name: "textprops_channel",
                        type: "select",
                        optional: false,
                        options: [
                            {
                                text: "00.General(일반업무)",
                                value: `${config.general_Channel_ID}`
                            },
                            {
                                text: "01.Sales(영업관리)",
                                value: `${config.sales_Channel_ID}`,
                            },
                            {
                                text: "02.Marketing(마케팅)",
                                value: `${config.marketing_Channel_ID}`
                            },
                            {
                                text: "03.Engineering(기술)",
                                value: `${config.engineering_Channel_ID}`
                            },
                            {
                                text: "04.Customer(사용자)",
                                value: `${config.customer_Channel_ID}`
                            },
                            {
                                text: "05.Support(지원)",
                                value: `${config.support_Channel_ID}`
                            },
                            {
                                text: "06.Meetings(회의실)",
                                value: `${config.meetings_Channel_ID}`
                            },
                            {
                                text: "20.Partners(파트너사)",
                                value: `${config.partners_Channel_ID}`
                            },
                            {
                                text: "91.OpenSpace(회관)",
                                value: `${config.openspace_Channel_ID}`
                            },
                            {
                                text: "92.OpenPlay(추천)",
                                value: `${config.openplay_Channel_ID}`
                            },
                            {
                                text: "93.OpenShow(TV쇼)",
                                value: `${config.openshow_Channel_ID}`
                            },
                            {
                                text: "01.General(총괄팀)",
                                value: `${config.private_general_Channel_ID}`
                            }/* ,
                            {
                                text: "개발용 : 특급 오후 6시 30분행 열차 채널",
                                value: `${config.Channel_ID}`
                            } */
                        ]
                    },
                    {
                        display_name: `공지할 내용`,
                        name: 'textprops_notice',
                        type: 'textarea',
                        optional: false,
                    },
                    {
                        display_name: '작성자(절대 수정하지 마세요)',
                        name: 'textprops_name_real',
                        type: 'text',
                        default: `${username}`,
                        optional: false,
                    }
                ],
                submit_label: '추가',
                notify_on_cancel: false,
            }
        }
        axios.post(config.Finger_Chat_API_URL2, dialogNewPost, postHeader
        ).catch(error => {
            sendDM(config.FingerChat_Error_Notice_Member_ID, `API 에러가 발생하였습니다.\n${error}`);
        });
    }

    const dialogNew = async (id) => {
        let dialogNewPost;
        dialogNewPost = {
            trigger_id: id,
            url: `${config.Server_URL}/submit_create`,
            dialog: {
                title: '새로운 User 추가',
                elements: [
                    {
                        display_name: '이름',
                        name: 'textprops_name',
                        type: 'text',
                        optional: false,
                    },
                    {
                        display_name: '영문이름(Mattermost의 이름.성 표기)',
                        name: 'textprops_mattermost_name',
                        placeholder: "gildong.hong",
                        type: 'text',
                        optional: false,
                    },
                    {
                        display_name: '내선번호',
                        name: 'textprops_inLineNum',
                        type: 'text',
                        optional: false,
                    },
                    {
                        display_name: '부서',
                        name: 'textprops_department',
                        type: 'text',
                        optional: false,
                    },
                    {
                        display_name: "직급(직위)",
                        name: "textprops_position",
                        type: "select",
                        optional: false,
                        options: [
                            {
                                text: "부사장",
                                value: "1"
                            },
                            {
                                text: "수석",
                                value: "2"
                            },
                            {
                                text: "책임",
                                value: "3"
                            },
                            {
                                text: "과장",
                                value: "4"
                            },
                            {
                                text: "선임",
                                value: "5"
                            },
                            {
                                text: "주임",
                                value: "6"
                            },
                            {
                                text: "사원",
                                value: "7"
                            }
                        ]
                    },
                    {
                        display_name: '연락처',
                        name: 'textprops_phoneNum',
                        placeholder: "010-9876-5432",
                        type: 'text',
                        optional: false,
                    },
                    {
                        display_name: '생일',
                        name: 'textprops_birthday',
                        min_length: 4,
                        max_length: 4,
                        placeholder: "0411",
                        type: 'text',
                        optional: false,
                    },
                    {
                        display_name: '사물함 번호',
                        name: 'textprops_locker',
                        min_length: 1,
                        max_length: 2,
                        placeholder: "없음",
                        type: 'text',
                        optional: false,
                    }
                ],
                submit_label: 'User 추가하기',
                notify_on_cancel: false,
            }
        }
        axios.post(config.Finger_Chat_API_URL2, dialogNewPost, postHeader
        ).catch(error => {
            sendDM(config.FingerChat_Error_Notice_Member_ID, `API 에러가 발생하였습니다.\n${error}`);
        });
    }

    const dialogSurveyModify = async (id, username, contents, userName, lastDate) => {
        let tempElements = [];
        let date = new Date();
        let tempMonth = date.getMonth() + 1;
        let tempDate = date.getDate();
        if (1 >= tempMonth.toString().length) {
            tempMonth = `0${tempMonth}`;
        }
        if (1 >= tempDate.toString().length) {
            tempDate = `0${tempDate}`;
        }
        let dialogModifyPost;
        if (typeof contents == 'object') {
            for (let i = 0; i < contents.length - 1; i++) {
                tempElements[i] = { text: `${contents[i + 1]}`, value: `${contents[i + 1]}` };
            }
            dialogModifyPost = {
                trigger_id: id,
                url: `${config.Server_URL}/submit_survey_update`,
                dialog: {
                    title: '참여 Survey 수정',
                    elements: [
                        {
                            display_name: '참여자(절대 수정하지 마세요.)',
                            name: 'textprops_name',
                            type: 'text',
                            default: `${username}`,
                            optional: false,
                        },
                        {
                            display_name: `내용`,
                            name: "textprops_survey",
                            type: "select",
                            default: `${contents[0]}`,
                            optional: false,
                            options: tempElements
                        },
                        {
                            display_name: '입력 날짜',
                            name: 'textprops_date',
                            type: 'text',
                            default: `${lastDate}(${date.getFullYear()}-${tempMonth}-${tempDate}에 수정됨)`,
                            optional: false,
                        }
                    ],
                    submit_label: '입력 정보로 수정',
                    notify_on_cancel: false,
                }
            }
        } else {
            dialogModifyPost = {
                trigger_id: id,
                url: `${config.Server_URL}/submit_survey_update`,
                dialog: {
                    title: '참여 Survey 수정',
                    elements: [
                        {
                            display_name: '참여자(절대 수정하지 마세요.)',
                            name: 'textprops_name',
                            type: 'text',
                            default: `${userName}`,
                            optional: false,
                        },
                        {
                            display_name: '내용',
                            name: 'textprops_survey',
                            type: 'text',
                            default: `${contents}`,
                            optional: false,
                        },
                        {
                            display_name: '입력 날짜',
                            name: 'textprops_date',
                            type: 'text',
                            default: `${lastDate}(${date.getFullYear()}-${tempMonth}-${tempDate}에 수정됨)`,
                            optional: false,
                        }
                    ],
                    submit_label: '입력 정보로 수정',
                    notify_on_cancel: false,
                }
            }
        }
        axios.post(config.Finger_Chat_API_URL2, dialogModifyPost, postHeader
        ).catch(error => {
            sendDM(config.FingerChat_Error_Notice_Member_ID, `API 에러가 발생하였습니다.\n${error}`);
        });
    }

    const noticeDialogModify = async (id, username, messageID) => {
        axios.get(`${config.Finger_Chat_API_URL}/${messageID}`, postHeader
            ).then(res => {
                let dialogNewPost;
                dialogNewPost = {
                    trigger_id: id,
                    url: `${config.Server_URL}/notice_edit_to_channel`,
                    dialog: {
                        title: 'Notice 수정',
                        elements: [
                            {
                                display_name: `공지할 내용`,
                                name: 'textprops_notice',
                                type: 'textarea',
                                default: `${res.data.message}`,
                                optional: false,
                            },
                            {
                                display_name: `messageID(절대 수정하지 마세요)`,
                                name: 'textprops_noticeID',
                                type: 'text',
                                default: `${messageID}`,
                                optional: false,
                            }/* ,
                            {
                                display_name: `UserNameData(절대 수정하지 마세요)`,
                                name: 'textprops_username',
                                type: 'text',
                                default: `${username}`,
                                optional: false,
                            } */
                        ],
                        submit_label: '수정',
                        notify_on_cancel: false,
                    }
                }
                axios.post(config.Finger_Chat_API_URL2, dialogNewPost, postHeader
                ).catch(error => {
                    sendDM(config.FingerChat_Error_Notice_Member_ID, `API 에러가 발생하였습니다.\n${error}`);
                });
            }) .catch(error => {
                sendDM(config.FingerChat_Error_Notice_Member_ID, `API 에러가 발생하였습니다.\n${error}`);
            });
    }

    const dialogModify = async (id, username, userData) => {
        let dialogModifyPost;
        dialogModifyPost = {
            trigger_id: id,
            url: `${config.Server_URL}/submit_modify`,
            dialog: {
                title: 'User 정보 수정',
                elements: [
                    {
                        display_name: '이름',
                        name: 'textprops_name',
                        type: 'text',
                        default: `${userData[0]}`,
                        optional: false,
                    },
                    {
                        display_name: '영문이름(Mattermost의 이름.성 표기)',
                        name: 'textprops_mattermost_name',
                        type: 'text',
                        default: `${userData[5]}`,
                        optional: false,
                    },
                    {
                        display_name: '내선번호',
                        name: 'textprops_inLineNum',
                        type: 'text',
                        default: `${userData[1]}`,
                        optional: false,
                    },
                    {
                        display_name: '부서',
                        name: 'textprops_department',
                        type: 'text',
                        default: `${userData[6]}`,
                        optional: false,
                    },
                    {
                        display_name: "직급(직위)",
                        name: "textprops_position",
                        type: "select",
                        default: `${userData[2]}`,
                        optional: false,
                        options: [
                            {
                                text: "부사장",
                                value: "1"
                            },
                            {
                                text: "수석",
                                value: "2"
                            },
                            {
                                text: "책임",
                                value: "3"
                            },
                            {
                                text: "과장",
                                value: "4"
                            },
                            {
                                text: "선임",
                                value: "5"
                            },
                            {
                                text: "주임",
                                value: "6"
                            },
                            {
                                text: "사원",
                                value: "7"
                            }
                        ]
                    },
                    {
                        display_name: '연락처',
                        name: 'textprops_phoneNum',
                        type: 'text',
                        default: `${userData[3]}`,
                        optional: false,
                    },
                    {
                        display_name: '생일',
                        name: 'textprops_birthday',
                        type: 'text',
                        default: `${userData[4].substring(4, 8)}`,
                        optional: false,
                    },
                    {
                        display_name: '사물함 번호',
                        name: 'textprops_locker',
                        min_length: 1,
                        max_length: 2,
                        default : `${userData[7]}`,
                        type: 'text',
                        optional: false,
                    }
                ],
                submit_label: '입력 정보로 수정',
                notify_on_cancel: false,
            }
        }
        axios.post(config.Finger_Chat_API_URL2, dialogModifyPost, postHeader
        ).catch(error => {
            sendDM(config.FingerChat_Error_Notice_Member_ID, `API 에러가 발생하였습니다.\n${error}`);
        });
    }

    const getUserInfo = async (userName) => {
        try {
            let connection = await pool.getConnection(async conn => conn);
            try {
                let [results] = await connection.query(`SELECT * FROM userInfo WHERE name='${userName}';`);
                connection.destroy();
                return [`${results[0].name}`, `${results[0].inLineNum}`, `${results[0].position}`, `${results[0].phoneNum}`, `${results[0].birthday}`, `${results[0].id}`, `${results[0].department}`, `${results[0].Locker}`];
            } catch (error) {
                connection.destroy();
                return `201`;
            }
        } catch (error) {
            return `202`;
        }
    }

    const deleteAllSurvey = async () => {
        surveyList = []
        try {
            let connection = await pool.getConnection(async conn => conn);
            try {
                let [userYesNo] = await connection.query(`SELECT EXISTS (SELECT * FROM surveyInfo) AS SUCCESS;`);
                connection.release();
                if (userYesNo[0].SUCCESS == '0') {
                    connection.destroy();
                    return `none`;
                } else {
                    try {
                        let [results] = await connection.query(`TRUNCATE surveyInfo;`);
                        connection.destroy();
                    } catch (error) {
                        connection.destroy();
                        return `error`;
                    }
                }
            } catch (error) {
                connection.destroy();
                return `queryError`;
            }
        } catch (error) {
            return `DBerror`;
        }
    }

    const getSurveyExists = async () => {
        try {
            let connection = await pool.getConnection(async conn => conn);
            try {
                let [userYesNo] = await connection.query(`SELECT EXISTS (SELECT userInfo.id, userInfo.name FROM userInfo WHERE EXISTS ( SELECT DISTINCT surveyInfo.userName FROM surveyInfo WHERE surveyInfo.userName = userInfo.id ) ORDER BY userInfo.name ASC) AS SUCCESS;`);
                connection.release();
                if (userYesNo[0].SUCCESS == '0') {
                    connection.destroy();
                    return `none`;
                } else {
                    try {
                        let [results] = await connection.query(`SELECT userInfo.id, userInfo.name FROM userInfo WHERE EXISTS ( SELECT DISTINCT surveyInfo.userName FROM surveyInfo WHERE surveyInfo.userName = userInfo.id AND surveyInfo.sort = '1' ) ORDER BY userInfo.name ASC;`);
                        connection.release();
                        surveyExists = [`| No. | 참여자 | 참여여부 |\n`, `| --- | --- | --- |\n`];
                        surveyExists.push(`| --- | 참여자 | --- |\n`);
                        for (let i = 0; i < results.length; i++) {
                            surveyExists.push(`| ${i + 1} | ${results[i].name} | :o: |\n`);
                        }
                        let [userYesNo2] = await connection.query(`SELECT EXISTS (SELECT userInfo.id, userInfo.name FROM userInfo WHERE NOT EXISTS ( SELECT DISTINCT surveyInfo.userName FROM surveyInfo WHERE surveyInfo.userName = userInfo.id ) ORDER BY userInfo.name ASC) AS SUCCESS;`);
                        connection.destroy();
                        if (userYesNo2[0].SUCCESS == '1') {
                            try {
                                let connection = await pool.getConnection(async conn => conn);
                                try {
                                    let [results2] = await connection.query(`SELECT userInfo.id, userInfo.name FROM userInfo WHERE NOT EXISTS ( SELECT DISTINCT surveyInfo.userName FROM surveyInfo WHERE surveyInfo.userName = userInfo.id ) ORDER BY userInfo.name ASC;`);
                                    connection.destroy();
                                    surveyExists.push(`| --- | 미참여자 | --- |\n`);
                                    for (let i = 0; i < results2.length; i++) {
                                        surveyExists.push(`| ${i + 1} | ${results2[i].name} | :x: |\n`);
                                    }
                                } catch (error) {
                                    connection.destroy();
                                    return `queryError`;
                                }
                            } catch (error) {
                                return `DBerror`;
                            }
                        }
                    } catch (error) {
                        connection.destroy();
                        return `error`;
                    }
                }
            } catch (error) {
                connection.destroy();
                return `queryError`;
            }
        } catch (error) {
            return `DBerror`;
        }
    }

    const getSurveyResult = async () => {
        try {
            let connection = await pool.getConnection(async conn => conn);
            try {
                let [userYesNo] = await connection.query(`SELECT EXISTS (SELECT * FROM surveyInfo WHERE sort >= 1) AS SUCCESS;`);
                connection.release();
                if (userYesNo[0].SUCCESS == '0') {
                    connection.destroy();
                    return `none`;
                } else {
                    try {
                        let [results] = await connection.query(`SELECT * FROM surveyInfo WHERE sort >= 1;`);
                        connection.destroy();
                        surveyList = [`| No. | 참여자 | 참여일자 | 내용 |\n`, `| --- | --- | --- | --- |\n`];
                        for (let i = 0; i < results.length; i++) {
                            surveyList.push(`| ${i + 1} | ${results[i].userName} | ${results[i].date} | ${results[i].contents} |\n`);
                        }
                    } catch (error) {
                        connection.destroy();
                        return `error`;
                    }
                }
            } catch (error) {
                connection.destroy();
                return `queryError`;
            }
        } catch (error) {
            return `DBerror`;
        }
    }

    const getUserSurveyContents = async (userName) => {
        try {
            let connection = await pool.getConnection(async conn => conn);
            try {
                let [userYesNo] = await connection.query(`SELECT EXISTS (SELECT * FROM surveyInfo WHERE userName = '${userName}' AND sort >= 1) AS SUCCESS;`);
                connection.release();
                if (userYesNo[0].SUCCESS == '0') {
                    connection.destroy();
                    return `none`;
                } else {
                    try {
                        let [surveyCount] = await connection.query(`SELECT COUNT(*) AS cnt FROM surveyInfo WHERE sort = 0;`);
                        connection.release();
                        if (Number(surveyCount[0].cnt) >= 2) {
                            try {
                                let tempArray = [];
                                let [results] = await connection.query(`SELECT * FROM surveyInfo WHERE userName = '${userName}' AND sort >= 1;`);
                                tempArray.push(results[0].contents);
                                let [results2] = await connection.query(`SELECT * FROM surveyInfo WHERE sort = 0;`);
                                for (let i = 1; results2.length > i; i++) {
                                    tempArray.push(results2[i].contents);
                                }
                                connection.destroy();
                                return [tempArray, `${results[0].userName}`, `${results[0].date}`];
                            } catch (error) {
                                connection.destroy();
                                return `error`;
                            }
                        } else {
                            try {
                                let [results] = await connection.query(`SELECT * FROM surveyInfo WHERE userName = '${userName}' AND sort >= 1;`);
                                connection.destroy();
                                return [`${results[0].contents}`, `${results[0].userName}`, `${results[0].date}`];
                            } catch (error) {
                                connection.destroy();
                                return `error`;
                            }
                        }
                    } catch (error) {
                        connection.destroy();
                        return `error`;
                    }
                }
            } catch (error) {
                connection.destroy();
                return `queryError`;
            }
        } catch (error) {
            return `DBerror`;
        }
    }

    const getUserSurveyExists = async (userName) => {
        try {
            let connection = await pool.getConnection(async conn => conn);
            try {
                let [userYesNo] = await connection.query(`SELECT EXISTS (SELECT * FROM surveyInfo WHERE userName = '${userName}' AND sort >= 1) AS SUCCESS;`);
                connection.destroy();
                if (userYesNo[0].SUCCESS == '0') {
                    return `none`;
                } else {
                    return `has`;
                }
            } catch (error) {
                connection.destroy();
                return `queryError`;
            }
        } catch (error) {
            return `DBerror`;
        }
    }

    const getNowSurvey = async () => {
        let tempContents = [];
        try {
            let connection = await pool.getConnection(async conn => conn);
            try {
                let [userYesNo] = await connection.query(`SELECT EXISTS (SELECT * FROM surveyInfo) AS SUCCESS;`);
                connection.release();
                if (userYesNo[0].SUCCESS == '0') {
                    connection.destroy();
                    return `none`;
                } else {
                    try {
                        let [results] = await connection.query(`SELECT * FROM surveyInfo WHERE sort = '0';`);
                        connection.destroy();
                        if (results.length > 1) {
                            for (let i = 0; i < results.length; i++) {
                                tempContents.push(results[i].contents);
                            }
                            return [tempContents, `${results[0].userName}`, `${results[0].date}`];
                        } else {
                            return [`${results[0].contents}`, `${results[0].userName}`, `${results[0].date}`];
                        }
                    } catch (error) {
                        connection.destroy();
                        return `error`;
                    }
                }
            } catch (error) {
                connection.destroy();
                return `queryError`;
            }
        } catch (error) {
            return `DBerror`;
        }
    }

    const covidDataList = async () => {
        try {
            let connection = await pool.getConnection(async conn => conn);
            try {
                let [results] = await connection.query(`SELECT userName, phone, temperature, userType, date_format(createdAt, '%Y년%m월%d일 %r') AS createdAt, visitedAt, visitOverSea, hasFever FROM covidData ORDER BY id DESC LIMIT 30;`);
                connection.destroy();
                userList = [`| No. | 이름 | 폰No. | 온도 | 직원유무 | 해외방문유무 | 발열유무 | 방문일 | 생성일 |\n`, `| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`];
                if (results.length == 0) {
                    return 'Database에 등록된 Data가 없습니다.'
                } else {
                    for (let i = 0; i < results.length; i++) {
                        let tempYnOverSea = results[i].visitOverSea == '0' ? '없음' : '있음';
                        let tempYnHasFever = results[i].hasFever == '0' ? '없음' : '있음';
                        userList.push(`| ${i + 1} | ${results[i].userName} | ${results[i].phone} | ${results[i].temperature} | ${results[i].userType} | ${tempYnOverSea} | ${tempYnHasFever} | ${results[i].visitedAt} | ${results[i].createdAt} |\n`);
                    }
                }
            } catch (error) {
                connection.destroy();
                return `Query 에서 에러가 발생하였습니다. 관리자에게 문의하세요.${error}`;
            }
        } catch (error) {
            connection.destroy();
            return `DB에서 에러가 발생하였습니다. 관리자에게 문의하세요.\n${error}`;
        }
    }

    const databaseListOrderBy = async (orderBy) => {
        let date = new Date();
        let tempMonth = date.getMonth() + 1;
        if (1 >= tempMonth.toString().length) {
            tempMonth = `0${tempMonth}`;
        }
        let tempDate;
        let tempPosition;
        let tempLocker;
        try {
            let connection = await pool.getConnection(async conn => conn);
            try {
                let [results] = await connection.query(`SELECT name, inLineNum, position, phoneNum, birthday, botUsageRole, id, Locker, department, DATE_FORMAT(STR_TO_DATE(birthday, '%Y%m%d'), '%Y년%m월%d일') AS date FROM userInfo ORDER BY ${orderBy} ASC, name ASC;`);
                connection.destroy();
                userList = [`| No. | 이름 | 내선 | 직위 | 부서 | 연락처 | 사물함 | 생일 |\n`, `| --- | --- | --- | --- | --- | --- | --- |\n`];
                if (results.length == 0) {
                    return 'Database에 등록된 User가 없습니다.'
                } else {
                    for (let i = 0; i < results.length; i++) {
                        if (results[i].position == '1') {
                            tempPosition = '부사장';
                        } else if (results[i].position == '2') {
                            tempPosition = '수석';
                        } else if (results[i].position == '3') {
                            tempPosition = '책임';
                        } else if (results[i].position == '4') {
                            tempPosition = '과장';
                        } else if (results[i].position == '5') {
                            tempPosition = '선임';
                        } else if (results[i].position == '6') {
                            tempPosition = '주임';
                        } else if (results[i].position == '7') {
                            tempPosition = '사원';
                        } else {
                            tempPosition = 'NO DATA';
                        }
                        if (results[i].date.substring(5, 7) == tempMonth) {
                            tempDate = `${results[i].date.substring(5, 11)} :birthday:`;
                        } else {
                            tempDate = results[i].date.substring(5, 11);
                        }
                        if(results[i].Locker == 'NULL'){
                            tempLocker = '없음'
                        } else {
                            tempLocker = results[i].Locker;
                        }
                        userList.push(`| ${i + 1} | ${results[i].name} | ${results[i].inLineNum} | ${tempPosition} | ${results[i].department} | ${results[i].phoneNum} | ${tempLocker} | ${tempDate} |\n`);
                    }
                }
            } catch (error) {
                connection.destroy();
                return `Query 에서 에러가 발생하였습니다. 관리자에게 문의하세요.${error}`;
            }
        } catch (error) {
            connection.destroy();
            return `DB에서 에러가 발생하였습니다. 관리자에게 문의하세요.\n${error}`;
        }
    }

    const getUserRole = async (userName) => {
        try {
            let connection = await pool.getConnection(async conn => conn);
            try {
                let [userYesNo] = await connection.query(`SELECT EXISTS (SELECT * FROM userInfo WHERE id='${userName}') AS SUCCESS;`);
                connection.release();
                if (userYesNo[0].SUCCESS == '0') {
                    connection.destroy();
                    return `Database에 User Data가 등록되어있지 않습니다. 먼저 Database에 User Info를 등록해주세요.`;
                } else {
                    try {
                        let [results] = await connection.query(`SELECT botUsageRole FROM userInfo WHERE id='${userName}';`);
                        connection.destroy();
                        return `${results[0].botUsageRole}`;
                    } catch (error) {
                        connection.destroy();
                        return `에러가 발생하였습니다. 관리자에게 문의하세요.`;
                    }
                }
            } catch (error) {
                connection.destroy();
                return `Query 에서 에러가 발생하였습니다. 관리자에게 문의하세요.`;
            }
        } catch (error) {
            return `DB에서 에러가 발생하였습니다. 관리자에게 문의하세요.`;
        }
    }

    const updateUserRole = async (userName, role) => {
        try {
            let connection = await pool.getConnection(async conn => conn);
            try {
                let [userYesNo] = await connection.query(`SELECT EXISTS (SELECT * FROM userInfo WHERE name='${userName}') AS SUCCESS;`);
                connection.release();
                if (userYesNo[0].SUCCESS == '0') {
                    connection.destroy();
                    return `해당 User가 존재하지 않습니다.`;
                } else {
                    try {
                        let [results] = await connection.query(`UPDATE userInfo SET botUsageRole = '${role}' WHERE name = '${userName}'`);
                        connection.destroy();
                        return `해당 User가 **'${role}'**으로 설정되었습니다.`;
                    } catch (error) {
                        connection.destroy();
                        return `에러가 발생하였습니다. 관리자에게 문의하세요.`;
                    }
                }
            } catch (error) {
                connection.destroy();
                return `Query 에서 에러가 발생하였습니다. 관리자에게 문의하세요.`;
            }
        } catch (error) {
            return `DB에서 에러가 발생하였습니다. 관리자에게 문의하세요.`;
        }
    }


    const removeUser = async (userName) => {
        try {
            let connection = await pool.getConnection(async conn => conn);
            try {
                let [userYesNo] = await connection.query(`SELECT EXISTS (SELECT * FROM userInfo WHERE name ='${userName}') AS SUCCESS;`);
                connection.release();
                if (userYesNo[0].SUCCESS == '0') {
                    connection.destroy();
                    return `해당 User가 존재하지 않습니다.`;
                } else {
                    try {
                        let [results] = await connection.query(`DELETE FROM userInfo WHERE name = '${userName}';`);
                        connection.destroy();
                        return `해당 User ${userName}이(가) Database에서 삭제되었습니다.`;
                    } catch (error) {
                        connection.destroy();
                        return `에러가 발생하였습니다. 관리자에게 문의하세요.`;
                    }
                }
            } catch (error) {
                connection.destroy();
                return `Query 에서 에러가 발생하였습니다. 관리자에게 문의하세요.`;
            }
        } catch (error) {
            return `DB에서 에러가 발생하였습니다. 관리자에게 문의하세요.`;
        }
    }

    const birthdayReminder = async () => {
        schedule.scheduleJob({ hour: 10, minute: 00, dayOfWeek: [1, 2, 3, 4, 5] }, async () => {
            let date = new Date();
            let tempMonth = date.getMonth() + 1;
            let tempDate = date.getDate();
            let tempPosition;
            if (1 >= tempMonth.toString().length) {
                tempMonth = `0${tempMonth}`;
            }
            if (1 >= tempDate.toString().length) {
                tempDate = `0${tempDate}`;
            }
            try {
                let connection = await pool.getConnection(async conn => conn);
                try {
                    let [userYesNo] = await connection.query(`SELECT EXISTS (SELECT * FROM userInfo WHERE birthday ='9999${tempMonth}${tempDate}') AS SUCCESS;`);
                    connection.release();
                    if (userYesNo[0].SUCCESS != '0') {
                        try {
                            let [results] = await connection.query(`SELECT ID, position FROM userInfo WHERE birthday = '9999${tempMonth}${tempDate}';`);
                            connection.destroy();
                            for (let i = 0; i < results.length; i++) {
                                if (results[i].position == '1') {
                                    tempPosition = '부사장';
                                } else if (results[i].position == '2') {
                                    tempPosition = '수석';
                                } else if (results[i].position == '3') {
                                    tempPosition = '책임';
                                } else if (results[i].position == '4') {
                                    tempPosition = '과장';
                                } else if (results[i].position == '5') {
                                    tempPosition = '선임';
                                } else if (results[i].position == '6') {
                                    tempPosition = '주임';
                                } else if (results[i].position == '7') {
                                    tempPosition = '사원';
                                } else {
                                    tempPosition = 'NO DATA';
                                }
                                postData = {
                                    channel_id: `${config.Channel_ID}`,
                                    message: `@${results[i].ID} ${tempPosition}님이 오늘 생일입니다. :clap: 생일축하드려요! :birthday:`
                                };

                                axios.post(config.Finger_Chat_API_URL, postData, postHeader
                                ).catch(error => {
                                    console.log(error);
                                });
                            }
                        } catch (error) {
                            connection.destroy();
                            sendDM(config.FingerChat_Error_Notice_Member_ID, `에러가 발생하였습니다.\n${error}`);
                        }
                    } else {
                        connection.destroy();
                    }
                } catch (error) {
                    sendDM(config.FingerChat_Error_Notice_Member_ID, `쿼리에서 에러가 발생하였습니다.\n${error}`);
                    connection.destroy();
                }
            } catch (error) {
                sendDM(config.FingerChat_Error_Notice_Member_ID, `Database에서 에러가 발생하였습니다.\n${error}`);
            }
        })
    }
    birthdayReminder();
};